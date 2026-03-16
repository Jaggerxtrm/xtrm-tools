import type { ExtensionAPI, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType, isBashToolResult } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import * as fs from "node:fs";
import { SubprocessRunner, EventAdapter, Logger } from "./core";

const logger = new Logger({ namespace: "beads" });

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();
	const isBeadsProject = (cwd: string) => fs.existsSync(path.join(cwd, ".beads"));

	const getSessionClaim = async (sessionId: string, cwd: string): Promise<string | null> => {
		const result = await SubprocessRunner.run("bd", ["kv", "get", `claimed:${sessionId}`], { cwd });
		if (result.code === 0) return result.stdout.trim();
		return null;
	};

	const setSessionClaim = async (sessionId: string, issueId: string, cwd: string): Promise<boolean> => {
		const result = await SubprocessRunner.run("bd", ["kv", "set", `claimed:${sessionId}`, issueId], { cwd });
		return result.code === 0;
	};

	const clearSessionClaim = async (sessionId: string, cwd: string): Promise<boolean> => {
		const result = await SubprocessRunner.run("bd", ["kv", "clear", `claimed:${sessionId}`], { cwd });
		return result.code === 0;
	};

	const getInProgressSummary = async (cwd: string): Promise<string | null> => {
		const result = await SubprocessRunner.run("bd", ["list", "--status=in_progress"], { cwd });
		if (result.code === 0 && result.stdout.includes("Total:")) {
			return result.stdout.trim();
		}
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

	// 0. Register Custom Commands
	pi.registerCommand({
		name: "claim",
		description: "Claim a beads issue for this session",
		async execute(args, ctx) {
			const cwd = getCwd(ctx);
			if (!isBeadsProject(cwd)) {
				ctx.ui.notify("Not a beads project.", "error");
				return;
			}

			const issueId = args[0];
			if (!issueId) {
				ctx.ui.notify("Usage: /claim <issue-id>", "warning");
				return;
			}

			// Ensure issue is in_progress first
			await SubprocessRunner.run("bd", ["update", issueId, "--status=in_progress"], { cwd });
			
			const ok = await setSessionClaim(ctx.sessionManager.sessionId, issueId, cwd);
			if (ok) {
				ctx.ui.notify(`Claimed issue: ${issueId}`, "info");
			} else {
				ctx.ui.notify(`Failed to claim issue: ${issueId}`, "error");
			}
		}
	});

	pi.registerCommand({
		name: "unclaim",
		description: "Clear the beads issue claim for this session",
		async execute(_args, ctx) {
			const cwd = getCwd(ctx);
			if (!isBeadsProject(cwd)) return;

			const ok = await clearSessionClaim(ctx.sessionManager.sessionId, cwd);
			if (ok) {
				ctx.ui.notify("Claim cleared.", "info");
			}
		}
	});

	// 1. Tool Call Interception (Edit Gate & Commit Gate)
	pi.on("tool_call", async (event, ctx) => {
		const cwd = getCwd(ctx);
		if (!isBeadsProject(cwd)) return undefined;

		const sessionId = ctx.sessionManager.sessionId;

		// A. Edit Gate
		if (EventAdapter.isMutatingFileTool(event)) {
			const claim = await getSessionClaim(sessionId, cwd);
			if (claim) return undefined;

			const hasWork = await hasTrackableWork(cwd);
			if (!hasWork) return undefined;

			const reason = "No active issue claim for this session. Use `/claim <id>` to track your work.";
			if (ctx.hasUI) {
				ctx.ui.notify("Beads: Edit blocked. Claim an issue first.", "warning");
			}
			return { block: true, reason };
		}

		// B. Commit Gate
		if (isToolCallEventType("bash", event)) {
			const command = event.input.command;
			if (/\bgit\s+commit\b/.test(command)) {
				const claim = await getSessionClaim(sessionId, cwd);
				if (claim) {
					const inProgress = await getInProgressSummary(cwd);
					const reason = `Resolve open claim [${claim}] before committing. Use \`bd close ${claim}\` first.\n\n${inProgress || ""}`;
					if (ctx.hasUI) {
						ctx.ui.notify("Beads: Commit blocked. Close active claim first.", "warning");
					}
					return { block: true, reason };
				}
			}
		}

		return undefined;
	});

	// 2. Tool Result Interception (Memory Gate)
	pi.on("tool_result", async (event, ctx) => {
		const cwd = getCwd(ctx);
		if (!isBeadsProject(cwd)) return undefined;

		if (isBashToolResult(event)) {
			const command = event.input.command;
			// Also clear claim on bd close
			if (/\bbd\s+close\b/.test(command) && !event.isError) {
				await clearSessionClaim(ctx.sessionManager.sessionId, cwd);

				const reminder = "\n\n**Beads Insight**: Work completed. Consider if this session produced insights worth persisting via `bd remember`.";
				const newContent = [...event.content];
				newContent.push({ type: "text", text: reminder });
				return { content: newContent };
			}
		}
		return undefined;
	});

	// 3. Compaction Support
	pi.on("session_before_compact", async (event, ctx) => {
		const cwd = getCwd(ctx);
		if (!isBeadsProject(cwd)) return undefined;

		const sessionId = ctx.sessionManager.sessionId;
		const claim = await getSessionClaim(sessionId, cwd);

		if (claim) {
			return {
				compaction: {
					summary: (event.compaction?.summary || "") + `\n\nActive Beads Claim: ${claim}`,
					firstKeptEntryId: event.preparation.firstKeptEntryId,
				}
			};
		}
		return undefined;
	});

	// 4. Shutdown Warning
	pi.on("session_shutdown", async (_event, ctx) => {
		const cwd = getCwd(ctx);
		if (!isBeadsProject(cwd)) return;

		const sessionId = ctx.sessionManager.sessionId;
		const claim = await getSessionClaim(sessionId, cwd);

		if (claim && ctx.hasUI) {
			ctx.ui.notify(`Warning: Exiting with active Beads claim [${claim}].`, "warning");
		}
	});
}
