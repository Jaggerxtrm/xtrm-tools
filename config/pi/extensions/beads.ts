import type { ExtensionAPI, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType, isBashToolResult } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import * as fs from "node:fs";
import { SubprocessRunner, EventAdapter, Logger } from "./core/lib";

const logger = new Logger({ namespace: "beads" });

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();
	const isBeadsProject = (cwd: string) => fs.existsSync(path.join(cwd, ".beads"));

	let cachedSessionId: string | null = null;

	// Resolve a stable session ID across event types.
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

	const hasTrackableWork = async (cwd: string): Promise<boolean> => {
		const result = await SubprocessRunner.run("bd", ["list"], { cwd });
		if (result.code === 0 && result.stdout.includes("Total:")) {
			const m = result.stdout.match(/Total:\s*\d+\s+issues?\s*\((\d+)\s+open,\s*(\d+)\s+in progress\)/);
			if (m) {
				const open = parseInt(m[1], 10);
				const inProgress = parseInt(m[2], 10);
				return (open + inProgress) > 0;
			}
		}
		return false;
	};

	pi.on("session_start", async (_event, ctx) => {
		cachedSessionId = ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionId ?? ctx?.session_id ?? cachedSessionId;
		return undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		const cwd = getCwd(ctx);
		if (!isBeadsProject(cwd)) return undefined;
		const sessionId = getSessionId(ctx);

		if (EventAdapter.isMutatingFileTool(event)) {
			const claim = await getSessionClaim(sessionId, cwd);
			if (!claim) {
			    const hasWork = await hasTrackableWork(cwd);
			    if (hasWork) {
			        if (ctx.hasUI) {
				        ctx.ui.notify("Beads: Edit blocked. Claim an issue first.", "warning");
			        }
			        return {
                        block: true,
                        reason: `No active issue claim for this session (${sessionId}).\n  bd update <id> --claim\n  bd kv set "claimed:${sessionId}" "<id>"`,
                    };
                }
            }
		}

		if (isToolCallEventType("bash", event)) {
			const command = event.input.command;
			if (command && /\bgit\s+commit\b/.test(command)) {
                const claim = await getSessionClaim(sessionId, cwd);
				if (claim) {
					return {
                        block: true,
                        reason: `Resolve open claim [${claim}] before committing.`,
                    };
				}
			}
		}

		return undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (isBashToolResult(event)) {
			const command = event.input.command;
			const sessionId = getSessionId(ctx);

			// Auto-claim on bd update --claim regardless of exit code.
			// bd returns exit 1 with "already in_progress" when status unchanged — still a valid claim intent.
			if (command && /\bbd\s+update\b/.test(command) && /--claim\b/.test(command)) {
				const issueMatch = command.match(/\bbd\s+update\s+(\S+)/);
				if (issueMatch) {
					const issueId = issueMatch[1];
					const cwd = getCwd(ctx);
					await SubprocessRunner.run("bd", ["kv", "set", `claimed:${sessionId}`, issueId], { cwd });
					const claimNotice = `\n\n✅ **Beads**: Session \`${sessionId}\` claimed issue \`${issueId}\`. File edits are now unblocked.`;
					return { content: [...event.content, { type: "text", text: claimNotice }] };
				}
			}

			if (command && /\bbd\s+close\b/.test(command) && !event.isError) {
				const reminder = "\n\n**Beads Insight**: Work completed. Consider if this session produced insights worth persisting via `bd remember`.";
				const newContent = [...event.content, { type: "text", text: reminder }];
				return { content: newContent };
			}
		}
		return undefined;
	});

	// Dual safety net: notify about unclosed claims when session ends
	const notifySessionEnd = async (ctx: any) => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return;
		const sessionId = getSessionId(ctx);
		const claim = await getSessionClaim(sessionId, cwd);
		if (claim && ctx.hasUI) {
			ctx.ui.notify(`Beads: Session ending with active claim [${claim}]`, "warning");
		}
	};

	pi.on("agent_end", async (_event, ctx) => {
		await notifySessionEnd(ctx);
		return undefined;
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		await notifySessionEnd(ctx);
		return undefined;
	});
}
