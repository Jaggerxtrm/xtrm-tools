import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, EventAdapter } from "../core/lib";

function isClaimCommand(command: string): { isClaim: boolean; issueId: string | null } {
	if (!/\bbd\s+update\b/.test(command) || !/--claim\b/.test(command)) {
		return { isClaim: false, issueId: null };
	}
	const match = command.match(/\bbd\s+update\s+(\S+)/);
	return { isClaim: true, issueId: match?.[1] ?? null };
}

function isCloseCommand(command: string): { isClose: boolean; issueId: string | null } {
	if (!/\bbd\s+close\b/.test(command)) return { isClose: false, issueId: null };
	const match = command.match(/\bbd\s+close\s+(\S+)/);
	return { isClose: true, issueId: match?.[1] ?? null };
}

function isWorktree(cwd: string): boolean {
	return cwd.includes("/.xtrm/worktrees/") || cwd.includes("/.claude/worktrees/");
}

function getSessionId(ctx: any): string {
	return ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionId ?? ctx?.session_id ?? process.pid.toString();
}

async function getSessionClaim(cwd: string, sessionId: string): Promise<string | null> {
	const claimResult = await SubprocessRunner.run("bd", ["kv", "get", `claimed:${sessionId}`], { cwd });
	if (claimResult.code !== 0) return null;
	const claimId = claimResult.stdout.trim();
	return claimId.length > 0 ? claimId : null;
}

async function isClaimStillInProgress(cwd: string, issueId: string): Promise<boolean> {
	const showResult = await SubprocessRunner.run("bd", ["show", issueId, "--json"], { cwd });
	if (showResult.code === 0 && showResult.stdout.trim()) {
		try {
			const parsed = JSON.parse(showResult.stdout);
			const record = Array.isArray(parsed) ? parsed[0] : parsed;
			if (record?.status) return record.status === "in_progress";
		} catch {
			// fall back to text parsing below
		}
	}

	const listResult = await SubprocessRunner.run("bd", ["list", "--status=in_progress"], { cwd });
	if (listResult.code !== 0) return false;
	const issuePattern = new RegExp(`^\\s*[◐●]?\\s*${issueId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m");
	return issuePattern.test(listResult.stdout);
}

function memoryPromptMessage(claimId: string | null, sessionId: string): string {
	const claimLine = claimId ? `claim \`${claimId}\` was closed.\n` : "";
	const ackCmd = `bd kv set "memory-gate-done:${sessionId}"`;
	return (
		`● Memory gate: ${claimLine}` +
		"For each candidate insight, check ALL 4:\n" +
		"  1. Hard to rediscover from code/docs?\n" +
		"  2. Not obvious from the current implementation?\n" +
		"  3. Will affect a future decision?\n" +
		"  4. Still relevant in ~14 days?\n" +
		'KEEP (all 4 yes) → `bd remember "<insight>"`\n' +
		"SKIP examples: file maps, flag inventories, per-issue summaries,\n" +
		"  wording tweaks, facts obvious from reading the source.\n" +
		`KEEP: \`${ackCmd} "saved: <key>"\`\n` +
		`SKIP: \`${ackCmd} "nothing novel — <one-line reason>"\`\n`
	);
}

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();
	let lastStopNoticeIssue: string | null = null;
	let lastWorktreeReminderCwd: string | null = null;

	// Claim sync + close tracking: fire on relevant bd commands.
	pi.on("tool_result", async (event, ctx) => {
		if (!isBashToolResult(event)) return undefined;
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;

		const command = event.input.command || "";

		// Claim: notify when bd update --claim runs
		const { isClaim, issueId: claimIssueId } = isClaimCommand(command);
		if (isClaim && claimIssueId) {
			const text = `\n\nSession Flow: claimed ${claimIssueId}. Work in this session is tracked.`;
			return { content: [...event.content, { type: "text", text }] };
		}

		// Close: mark closed-this-session for the memory gate
		const { isClose, issueId: closedIssueId } = isCloseCommand(command);
		if (isClose && closedIssueId) {
			const sessionId = getSessionId(ctx);
			await SubprocessRunner.run("bd", ["kv", "set", `closed-this-session:${sessionId}`, closedIssueId], { cwd });
		}

		return undefined;
	});

	// Stop gate + memory gate: runs at agent_end (non-blocking — notify only).
	pi.on("agent_end", async (_event, ctx) => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;

		const sessionId = getSessionId(ctx);

		// Stop gate: warn if claimed issue is still in progress
		const claimId = await getSessionClaim(cwd, sessionId);
		if (claimId) {
			const inProgress = await isClaimStillInProgress(cwd, claimId);
			if (inProgress) {
				if (lastStopNoticeIssue !== claimId && ctx.hasUI) {
					ctx.ui.notify(`Stop blocked: close your issue first: bd close ${claimId}`, "warning");
					lastStopNoticeIssue = claimId;
				}
				return undefined;
			}
			if (lastStopNoticeIssue === claimId) lastStopNoticeIssue = null;
		}

		// Memory gate: nudge if an issue was closed this session
		const memGateDoneResult = await SubprocessRunner.run(
			"bd", ["kv", "get", `memory-gate-done:${sessionId}`], { cwd }
		);
		if (memGateDoneResult.code === 0 && memGateDoneResult.stdout.trim()) {
			// Agent already acked — clear all markers and move on
			await SubprocessRunner.run("bd", ["kv", "clear", `memory-gate-done:${sessionId}`], { cwd });
			await SubprocessRunner.run("bd", ["kv", "clear", `closed-this-session:${sessionId}`], { cwd });
			await SubprocessRunner.run("bd", ["kv", "clear", `claimed:${sessionId}`], { cwd });
		} else {
			const closedResult = await SubprocessRunner.run(
				"bd", ["kv", "get", `closed-this-session:${sessionId}`], { cwd }
			);
			if (closedResult.code === 0 && closedResult.stdout.trim()) {
				const closedIssueId = closedResult.stdout.trim();
				if (ctx.hasUI) {
					ctx.ui.notify(memoryPromptMessage(closedIssueId, sessionId), "info");
				}
			}
		}

		if (isWorktree(cwd) && ctx.hasUI && lastWorktreeReminderCwd !== cwd) {
			ctx.ui.notify("Run `xt end` to create a PR and clean up this worktree.", "info");
			lastWorktreeReminderCwd = cwd;
		}

		return undefined;
	});
}
