import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import { SubprocessRunner, EventAdapter } from "../core/lib";
import { readSessionState } from "../core/session-state";

function isClaimCommand(command: string): { isClaim: boolean; issueId: string | null } {
	if (!/\bbd\s+update\b/.test(command) || !/--claim\b/.test(command)) {
		return { isClaim: false, issueId: null };
	}
	const match = command.match(/\bbd\s+update\s+(\S+)/);
	return { isClaim: true, issueId: match?.[1] ?? null };
}

function statePathFrom(startCwd: string): string {
	let current = path.resolve(startCwd || process.cwd());
	for (;;) {
		const candidate = path.join(current, ".xtrm-session-state.json");
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return path.join(startCwd, ".xtrm-session-state.json");
		current = parent;
	}
}

async function ensureWorktreeSessionState(cwd: string, issueId: string): Promise<{ ok: boolean; message?: string }> {
	const repoRootResult = await SubprocessRunner.run("git", ["rev-parse", "--show-toplevel"], { cwd });
	if (repoRootResult.code !== 0 || !repoRootResult.stdout) return { ok: false, message: "not a git repo" };
	const repoRoot = repoRootResult.stdout.trim();

	const gitDir = await SubprocessRunner.run("git", ["rev-parse", "--git-dir"], { cwd });
	const commonDir = await SubprocessRunner.run("git", ["rev-parse", "--git-common-dir"], { cwd });
	if (gitDir.code === 0 && commonDir.code === 0 && gitDir.stdout.trim() !== commonDir.stdout.trim()) {
		return { ok: false, message: "already in linked worktree" };
	}

	const overstoryDir = path.join(repoRoot, ".overstory");
	const worktreesBase = fs.existsSync(overstoryDir)
		? path.join(overstoryDir, "worktrees")
		: path.join(repoRoot, ".worktrees");
	fs.mkdirSync(worktreesBase, { recursive: true });

	const branch = `feature/${issueId}`;
	const worktreePath = path.join(worktreesBase, issueId);
	if (!fs.existsSync(worktreePath)) {
		const branchExists = (await SubprocessRunner.run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repoRoot })).code === 0;
		const addArgs = branchExists
			? ["worktree", "add", worktreePath, branch]
			: ["worktree", "add", worktreePath, "-b", branch];
		const add = await SubprocessRunner.run("git", addArgs, { cwd: repoRoot, timeoutMs: 20000 });
		if (add.code !== 0) {
			return { ok: false, message: add.stderr || add.stdout || "worktree creation failed" };
		}
	}

	const statePath = statePathFrom(repoRoot);
	const payload = {
		issueId,
		branch,
		worktreePath,
		prNumber: null,
		prUrl: null,
		phase: "claimed",
		conflictFiles: [],
		startedAt: new Date().toISOString(),
		lastChecked: new Date().toISOString(),
	};
	fs.writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return { ok: true, message: `Worktree created: ${worktreePath} Branch: ${branch}` };
}

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();

	pi.on("tool_result", async (event, ctx) => {
		if (!isBashToolResult(event)) return undefined;
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;

		const command = event.input.command || "";
		const { isClaim, issueId } = isClaimCommand(command);
		if (!isClaim || !issueId) return undefined;

		const ensured = await ensureWorktreeSessionState(cwd, issueId);
		if (ensured.ok) {
			const state = readSessionState(cwd);
			const worktreePath = state?.worktreePath;
			const nextStep = worktreePath
				? `\nNext: cd ${worktreePath} && pi  (sandboxed session)`
				: "";
			const text = `\n\n🧭 Session Flow: ${ensured.message}${nextStep}`;
			return { content: [...event.content, { type: "text", text }] };
		}
		return undefined;
	});

	pi.on("agent_end", async (_event, ctx) => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;
		const state = readSessionState(cwd);
		if (!state) return undefined;

		if (state.phase === "waiting-merge" || state.phase === "pending-cleanup") {
			const pr = state.prNumber != null ? `#${state.prNumber}` : "(pending PR)";
			const url = state.prUrl ? ` ${state.prUrl}` : "";
			pi.sendUserMessage(
				`⚠ PR ${pr}${url} is still pending. xtrm finish is deprecated for Pi workflow. ` +
				"Use xtpi publish (when available) and external merge/cleanup steps.",
			);
			return undefined;
		}

		if (state.phase === "conflicting") {
			const files = state.conflictFiles?.length ? state.conflictFiles.join(", ") : "unknown files";
			pi.sendUserMessage(
				`⚠ Conflicts in: ${files}. xtrm finish is deprecated for Pi workflow. ` +
				"Resolve conflicts, then continue with publish-only flow.",
			);
			return undefined;
		}

		if (state.phase === "claimed" || state.phase === "phase1-done") {
			pi.sendUserMessage(
				`⚠ Session has an active worktree at ${state.worktreePath}. ` +
				"Use publish-only workflow (no automatic push/PR/merge).",
			);
		}
		return undefined;
	});
}
