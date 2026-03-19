import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType, isBashToolResult } from "@mariozechner/pi-coding-agent";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { SubprocessRunner, EventAdapter, Logger } from "./core/lib";

const logger = new Logger({ namespace: "beads" });

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();

	let cachedSessionId: string | null = null;

	const getSessionId = (ctx: any): string => {
		const fromManager = ctx?.sessionManager?.getSessionId?.();
		const fromContext = ctx?.sessionId ?? ctx?.session_id;
		const resolved = fromManager || fromContext || cachedSessionId || process.pid.toString();
		if (resolved && !cachedSessionId) cachedSessionId = resolved;
		return resolved;
	};

	const getSessionClaim = async (sessionId: string, cwd: string): Promise<string | null> => {
		const result = await SubprocessRunner.run("bd", ["kv", "get", `claimed:${sessionId}`], { cwd });
		if (result.code === 0) return result.stdout.trim();
		return null;
	};

	const setClosedThisSession = async (sessionId: string, issueId: string, cwd: string): Promise<void> => {
		await SubprocessRunner.run("bd", ["kv", "set", `closed-this-session:${sessionId}`, issueId], { cwd });
	};

	const getClosedThisSession = async (sessionId: string, cwd: string): Promise<string | null> => {
		const result = await SubprocessRunner.run("bd", ["kv", "get", `closed-this-session:${sessionId}`], { cwd });
		if (result.code === 0) return result.stdout.trim();
		return null;
	};

	const clearKv = async (key: string, cwd: string): Promise<void> => {
		await SubprocessRunner.run("bd", ["kv", "clear", key], { cwd });
	};

	const hasTrackableWork = async (cwd: string): Promise<boolean> => {
		const result = await SubprocessRunner.run("bd", ["list"], { cwd });
		if (result.code === 0) {
			const counts = EventAdapter.parseBdCounts(result.stdout);
			if (counts) return (counts.open + counts.inProgress) > 0;
		}
		return false;
	};

	const hasInProgressWork = async (cwd: string): Promise<boolean> => {
		const result = await SubprocessRunner.run("bd", ["list"], { cwd });
		if (result.code === 0 && result.stdout.includes("Total:")) {
			const m = result.stdout.match(/Total:\s*\d+\s+issues?\s*\((\d+)\s+open,\s*(\d+)\s+in progress\)/);
			if (m) return parseInt(m[2], 10) > 0;
		}
		return false;
	};

	pi.on("session_start", async (_event, ctx) => {
		cachedSessionId = ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionId ?? ctx?.session_id ?? cachedSessionId;
		return undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;
		const sessionId = getSessionId(ctx);

		if (EventAdapter.isMutatingFileTool(event)) {
			const claim = await getSessionClaim(sessionId, cwd);
			if (!claim) {
				const hasWork = await hasTrackableWork(cwd);
				if (hasWork) {
					if (ctx.hasUI) ctx.ui.notify("Beads: Edit blocked. Claim an issue first.", "warning");
					return {
						block: true,
						reason: `No active claim for session ${sessionId}.\n  bd update <id> --claim\n`,
					};
				}
			}
		}

		if (isToolCallEventType("bash", event)) {
			const command = event.input.command;
			if (command && /\bgit\s+commit\b/.test(command)) {
				const claim = await getSessionClaim(sessionId, cwd);
				if (claim) {
					const inProgress = await hasInProgressWork(cwd);
					if (inProgress) {
						return {
							block: true,
							reason: `Active claim [${claim}] — close it first.\n  bd close ${claim}\n  (Pi workflow) publish/merge are external steps; do not rely on xtrm finish.\n`,
						};
					}
				}
			}
		}

		return undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!isBashToolResult(event)) return undefined;

		const command = event.input.command;
		const sessionId = getSessionId(ctx);
		const cwd = getCwd(ctx);

		if (command && /\bbd\s+update\b/.test(command) && /--claim\b/.test(command)) {
			const issueMatch = command.match(/\bbd\s+update\s+(\S+)/);
			if (issueMatch) {
				const issueId = issueMatch[1];
				await SubprocessRunner.run("bd", ["kv", "set", `claimed:${sessionId}`, issueId], { cwd });
				const claimNotice = `\n\n✅ **Beads**: Session \`${sessionId}\` claimed issue \`${issueId}\`. File edits are now unblocked.`;
				return { content: [...event.content, { type: "text", text: claimNotice }] };
			}
		}

		if (command && /\bbd\s+close\b/.test(command) && !event.isError) {
			const match = command.match(/\bbd\s+close\s+(\S+)/);
			const closedIssueId = match?.[1];
			if (closedIssueId) {
				await setClosedThisSession(sessionId, closedIssueId, cwd);
			}
			const reminder =
				"\n\n**Beads Insight**: Work completed. Consider if this session produced insights worth persisting via `bd remember`." +
				"\nWhen done, acknowledge memory gate with: `touch .beads/.memory-gate-done`";
			return { content: [...event.content, { type: "text", text: reminder }] };
		}

		return undefined;
	});

	const maybeHandleMemoryGate = async (ctx: any): Promise<boolean> => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return false;
		const sessionId = getSessionId(ctx);

		const marker = path.join(cwd, ".beads", ".memory-gate-done");
		if (existsSync(marker)) {
			try { unlinkSync(marker); } catch { /* ignore */ }
			await clearKv(`claimed:${sessionId}`, cwd);
			await clearKv(`closed-this-session:${sessionId}`, cwd);
			return true;
		}

		const closedIssueId = await getClosedThisSession(sessionId, cwd);
		if (!closedIssueId) return false;

		if (typeof (pi as any).sendUserMessage === "function") {
			(pi as any).sendUserMessage(
				`🧠 Memory gate: claim \`${closedIssueId}\` was closed this session.\n` +
				"For each closed issue, worth persisting?\n" +
				"  YES → `bd remember \"<insight>\"`\n" +
				"  NO  → note \"nothing to persist\"\n" +
				"  Then acknowledge: `touch .beads/.memory-gate-done`",
			);
		}
		return true;
	};

	const notifySessionEnd = async (ctx: any) => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return;
		const sessionId = getSessionId(ctx);

		const pendingMemory = await getClosedThisSession(sessionId, cwd);
		if (pendingMemory) return;

		const claim = await getSessionClaim(sessionId, cwd);
		if (!claim) return;

		const message = `Beads: session ending with active claim [${claim}]`;
		if (ctx.hasUI) ctx.ui.notify(message, "warning");
		else logger.warn(message);
	};

	pi.on("agent_end", async (_event, ctx) => {
		const handled = await maybeHandleMemoryGate(ctx);
		if (!handled) await notifySessionEnd(ctx);
		return undefined;
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		await notifySessionEnd(ctx);
		return undefined;
	});
}
