import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType, isBashToolResult } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, EventAdapter } from "../core/lib";

// ─── Autocommit helpers (mirrors hooks/beads-claim-sync.mjs) ─────────────────

async function hasGitChanges(cwd: string): Promise<boolean> {
	const result = await SubprocessRunner.run("git", ["status", "--porcelain"], { cwd });
	if (result.code !== 0) return false;
	return result.stdout.trim().length > 0;
}

async function stageUntracked(cwd: string): Promise<void> {
	const result = await SubprocessRunner.run("git", ["ls-files", "--others", "--exclude-standard"], { cwd });
	if (result.code !== 0 || !result.stdout.trim()) return;
	const untracked = result.stdout.trim().split("\n").filter(Boolean);
	if (untracked.length > 0) {
		await SubprocessRunner.run("git", ["add", "--", ...untracked], { cwd });
	}
}

async function getCloseReason(cwd: string, issueId: string, command: string): Promise<string> {
	// 1. Parse --reason "..." from the command itself
	const reasonMatch = command.match(/--reason[=\s]+["']([^"']+)["']/);
	if (reasonMatch) return reasonMatch[1].trim();

	// 2. Fall back to bd show <id> --json
	const show = await SubprocessRunner.run("bd", ["show", issueId, "--json"], { cwd });
	if (show.code === 0 && show.stdout.trim()) {
		try {
			const parsed = JSON.parse(show.stdout);
			const issue = Array.isArray(parsed) ? parsed[0] : parsed;
			const reason = issue?.close_reason;
			if (typeof reason === "string" && reason.trim()) return reason.trim();
		} catch { /* fall through */ }
	}

	return `Close ${issueId}`;
}

async function autoCommit(cwd: string, issueId: string, command: string): Promise<{ ok: boolean; message: string }> {
	if (!await hasGitChanges(cwd)) {
		return { ok: true, message: "No changes detected — auto-commit skipped." };
	}

	await stageUntracked(cwd);

	const reason = await getCloseReason(cwd, issueId, command);
	const commitMessage = `${reason} (${issueId})`;
	const result = await SubprocessRunner.run("git", ["commit", "--no-verify", "-am", commitMessage], { cwd });

	if (result.code !== 0) {
		const err = (result.stderr || result.stdout || "").trim();
		return { ok: false, message: `Auto-commit failed: ${err || "unknown error"}` };
	}

	return { ok: true, message: `Auto-committed: \`${commitMessage}\`` };
}

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();

	let cachedSessionId: string | null = null;
	let memoryGateFired = false;

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
		if (result.code !== 0) return null;
		const claim = result.stdout.trim();
		return claim.length > 0 ? claim : null;
	};

	const clearClaimMarker = async (sessionId: string, cwd: string) => {
		await SubprocessRunner.run("bd", ["kv", "clear", `claimed:${sessionId}`], { cwd });
	};

	const isIssueInProgress = async (issueId: string, cwd: string): Promise<boolean | null> => {
		const result = await SubprocessRunner.run("bd", ["show", issueId, "--json"], { cwd });
		if (result.code !== 0 || !result.stdout.trim()) return null;
		try {
			const parsed = JSON.parse(result.stdout);
			const issue = Array.isArray(parsed) ? parsed[0] : parsed;
			if (!issue?.status) return null;
			return issue.status === "in_progress";
		} catch {
			return null;
		}
	};

	const getActiveClaim = async (sessionId: string, cwd: string): Promise<string | null> => {
		const claim = await getSessionClaim(sessionId, cwd);
		if (!claim) return null;

		const inProgress = await isIssueInProgress(claim, cwd);
		if (inProgress === false) {
			await clearClaimMarker(sessionId, cwd);
			return null;
		}

		return claim;
	};

	const getClosedThisSession = async (sessionId: string, cwd: string): Promise<string | null> => {
		const result = await SubprocessRunner.run("bd", ["kv", "get", `closed-this-session:${sessionId}`], { cwd });
		if (result.code !== 0) return null;
		const issue = result.stdout.trim();
		return issue.length > 0 ? issue : null;
	};

	const clearSessionMarkers = async (sessionId: string, cwd: string) => {
		await SubprocessRunner.run("bd", ["kv", "clear", `claimed:${sessionId}`], { cwd });
		await SubprocessRunner.run("bd", ["kv", "clear", `closed-this-session:${sessionId}`], { cwd });
	};

	const hasTrackableWork = async (cwd: string): Promise<boolean> => {
		const result = await SubprocessRunner.run("bd", ["list"], { cwd });
		if (result.code === 0) {
			const counts = EventAdapter.parseBdCounts(result.stdout);
			if (counts) return (counts.open + counts.inProgress) > 0;
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
			const claim = await getActiveClaim(sessionId, cwd);
			if (!claim) {
				const hasWork = await hasTrackableWork(cwd);
				if (hasWork) {
					if (ctx.hasUI) {
						ctx.ui.notify("Beads: Edit blocked. Claim an issue first.", "warning");
					}
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
				const claim = await getActiveClaim(sessionId, cwd);
				if (claim) {
					return {
						block: true,
						reason: `Active claim [${claim}] — close it first.\n  bd close ${claim}\n  (Pi workflow) publish/merge are external steps; do not rely on xtrm finish.\n`,
					};
				}
			}
		}

		return undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!isBashToolResult(event)) return undefined;

		const command = event.input.command || "";
		const sessionId = getSessionId(ctx);
		const cwd = getCwd(ctx);

		// Auto-claim on bd update --claim regardless of exit code.
		if (/\bbd\s+update\b/.test(command) && /--claim\b/.test(command)) {
			const issueMatch = command.match(/\bbd\s+update\s+(\S+)/);
			if (issueMatch) {
				const issueId = issueMatch[1];
				await SubprocessRunner.run("bd", ["kv", "set", `claimed:${sessionId}`, issueId], { cwd });
				memoryGateFired = false;
				const claimNotice = `\n\n✅ **Beads**: Session \`${sessionId}\` claimed issue \`${issueId}\`. File edits are now unblocked.`;
				return { content: [...event.content, { type: "text", text: claimNotice }] };
			}
		}

		if (/\bbd\s+close\b/.test(command) && !event.isError) {
			const closeMatch = command.match(/\bbd\s+close\s+(\S+)/);
			const closedIssueId = closeMatch?.[1] ?? null;

			// Auto-commit staged changes (mirrors hooks/beads-claim-sync.mjs)
			const commit = closedIssueId ? await autoCommit(cwd, closedIssueId, command) : null;

			if (closedIssueId) {
				await SubprocessRunner.run("bd", ["kv", "set", `closed-this-session:${sessionId}`, closedIssueId], { cwd });
				memoryGateFired = false;
			}

			const commitLine = commit
				? `\n${commit.ok ? "✅" : "⚠️"} **Session Flow**: ${commit.message}`
				: "";
			const reminder = `\n\n**Beads Insight**: Work completed. Consider if this session produced insights worth persisting via \`bd remember\`.${commitLine}`;
			return { content: [...event.content, { type: "text", text: reminder }] };
		}

		return undefined;
	});

	// Memory gate: if this session closed an issue, prompt for insight persistence.
	// Uses sendUserMessage to trigger a new turn in Pi (non-blocking alternative to Claude Stop hook).
	const triggerMemoryGateIfNeeded = async (ctx: any) => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return;
		const sessionId = getSessionId(ctx);

		const markerCheck = await SubprocessRunner.run("bd", ["kv", "get", `memory-gate-done:${sessionId}`], { cwd });
		if (markerCheck.code === 0) {
			await SubprocessRunner.run("bd", ["kv", "clear", `memory-gate-done:${sessionId}`], { cwd });
			await clearSessionMarkers(sessionId, cwd);
			memoryGateFired = false;
			return;
		}

		if (memoryGateFired) return;

		const closedIssueId = await getClosedThisSession(sessionId, cwd);
		if (!closedIssueId) return;

		memoryGateFired = true;
		if (ctx.hasUI) {
			ctx.ui.notify(
				`🧠 Memory gate: claim \`${closedIssueId}\` was closed this session.\n` +
				`For each candidate insight, check ALL 4:\n` +
				`  1. Hard to rediscover from code/docs?\n` +
				`  2. Not obvious from the current implementation?\n` +
				`  3. Will affect a future decision?\n` +
				`  4. Still relevant in ~14 days?\n` +
				`KEEP (all 4 yes) → \`bd remember "<insight>"\`\n` +
				`SKIP examples: file maps, flag inventories, per-issue summaries,\n` +
				`  wording tweaks, facts obvious from reading the source.\n` +
				`KEEP: \`bd kv set "memory-gate-done:${sessionId}" "saved: <key>"\`\n` +
				`SKIP: \`bd kv set "memory-gate-done:${sessionId}" "nothing novel — <one-line reason>"\``,
				"info",
			);
		}
	};

	pi.on("agent_end", async (_event, ctx) => {
		await triggerMemoryGateIfNeeded(ctx);
		return undefined;
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		await triggerMemoryGateIfNeeded(ctx);
		return undefined;
	});
}
