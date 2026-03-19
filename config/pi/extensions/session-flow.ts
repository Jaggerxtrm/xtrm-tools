import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, EventAdapter } from "./core/lib";

function parseClosedIssueId(command: string): string | null {
	if (!/\bbd\s+close\b/.test(command)) return null;
	const match = command.match(/\bbd\s+close\s+(\S+)/);
	return match?.[1] ?? null;
}

async function getCloseReason(cwd: string, issueId: string): Promise<string> {
	const show = await SubprocessRunner.run("bd", ["show", issueId, "--json"], { cwd });
	if (show.code !== 0 || !show.stdout) return `Close ${issueId}`;

	try {
		const parsed = JSON.parse(show.stdout);
		const reason = parsed?.[0]?.close_reason;
		if (typeof reason === "string" && reason.trim().length > 0) return reason.trim();
	} catch {
		// fall through
	}
	return `Close ${issueId}`;
}

async function hasGitChanges(cwd: string): Promise<boolean> {
	const status = await SubprocessRunner.run("git", ["status", "--porcelain"], { cwd });
	if (status.code !== 0) return false;
	return status.stdout.trim().length > 0;
}

async function autoCommitFromClosedIssue(cwd: string, issueId: string): Promise<{ ok: boolean; message: string }> {
	if (!(await hasGitChanges(cwd))) {
		return { ok: true, message: "No changes detected — auto-commit skipped." };
	}

	const reason = await getCloseReason(cwd, issueId);
	const commitMessage = `${reason} (${issueId})`;

	const add = await SubprocessRunner.run("git", ["add", "-A"], { cwd });
	if (add.code !== 0) {
		return { ok: false, message: `git add failed: ${add.stderr || add.stdout || "unknown error"}` };
	}

	const commit = await SubprocessRunner.run("git", ["commit", "-m", commitMessage], { cwd });
	if (commit.code !== 0) {
		return { ok: false, message: `git commit failed: ${commit.stderr || commit.stdout || "unknown error"}` };
	}

	return { ok: true, message: `Auto-commit created from close reason: \`${commitMessage}\`` };
}

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();

	pi.on("tool_result", async (event, ctx) => {
		if (!isBashToolResult(event)) return undefined;
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;
		if (event.isError) return undefined;

		const command = event.input.command || "";
		if (!/\bbd\s+close\b/.test(command)) return undefined;

		const issueId = parseClosedIssueId(command);
		if (!issueId) {
			const text = "\n\n🧭 Session Flow: bd close detected without explicit issue id — auto-commit skipped.";
			return { content: [...event.content, { type: "text", text }] };
		}

		const result = await autoCommitFromClosedIssue(cwd, issueId);
		const prefix = result.ok ? "✅" : "⚠";
		const text = `\n\n${prefix} Session Flow: ${result.message}`;
		return { content: [...event.content, { type: "text", text }] };
	});

	// Worktree lifecycle reminders are disabled in Pi while migrating to explicit xtpi flow.
	pi.on("agent_end", async () => undefined);
}
