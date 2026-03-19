import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, EventAdapter } from "./core/lib";
import { SAFE_BASH_PREFIXES, DANGEROUS_BASH_PATTERNS } from "./core/guard-rules";
import { readSessionState } from "./core/session-state";

function normalizeGitCCommand(cmd: string): string {
	const gitC = cmd.match(/^git\s+-C\s+(?:"[^"]+"|'[^']+'|\S+)\s+(.+)$/);
	if (gitC?.[1]) return `git ${gitC[1]}`;
	return cmd;
}

export default function (pi: ExtensionAPI) {
	const getProtectedBranches = (): string[] => {
		const env = process.env.MAIN_GUARD_PROTECTED_BRANCHES;
		if (env) return env.split(",").map((b) => b.trim()).filter(Boolean);
		return ["main", "master"];
	};

	const getCurrentBranch = async (cwd: string): Promise<string | null> => {
		const result = await SubprocessRunner.run("git", ["branch", "--show-current"], { cwd });
		if (result.code === 0) return result.stdout;
		return null;
	};

	const protectedPaths = [".env", ".git/", "node_modules/"];

	pi.on("tool_call", async (event, ctx) => {
		const cwd = ctx.cwd || process.cwd();

		// 1) Global protected path guard
		if (EventAdapter.isMutatingFileTool(event)) {
			const path = EventAdapter.extractPathFromToolInput(event, cwd);
			if (path && protectedPaths.some((p) => path.includes(p))) {
				return {
					block: true,
					reason: `Path \"${path}\" is protected. Edits to sensitive system files are restricted.`,
				};
			}
		}

		// 2) Global dangerous bash confirmation
		if (isToolCallEventType("bash", event)) {
			const cmd = event.input.command.trim();
			const dangerousRegexes = DANGEROUS_BASH_PATTERNS.map((pattern) => new RegExp(pattern));
			const dangerousMatch = dangerousRegexes.some((rx) => rx.test(cmd));
			if (dangerousMatch && !cmd.includes("--help")) {
				if (ctx.hasUI) {
					const ok = await ctx.ui.confirm("Dangerous Command", `Allow execution of: ${cmd}?`);
					if (!ok) return { block: true, reason: "Blocked by user confirmation" };
				} else {
					return { block: true, reason: "Dangerous command blocked in non-interactive mode" };
				}
			}
		}

		// 3) Protected branch policy
		const protectedBranches = getProtectedBranches();
		const branch = await getCurrentBranch(cwd);
		if (!branch || !protectedBranches.includes(branch)) return undefined;

		const sessionState = readSessionState(cwd);

		if (EventAdapter.isMutatingFileTool(event)) {
			return {
				block: true,
				reason:
					`On protected branch '${branch}' — start on a feature branch and claim an issue.\n` +
					"  git checkout -b feature/<name>  (or: git switch -c feature/<name>)\n" +
					"  bd update <id> --claim\n",
			};
		}

		if (!isToolCallEventType("bash", event)) return undefined;

		const cmd = event.input.command.trim();
		const normalizedCmd = normalizeGitCCommand(cmd);

		// Emergency override
		if (process.env.MAIN_GUARD_ALLOW_BASH === "1") return undefined;

		// Enforce squash-only PR merges
		if (/^gh\s+pr\s+merge\b/.test(cmd)) {
			if (!/--squash\b/.test(cmd)) {
				return {
					block: true,
					reason: "Squash only: use `gh pr merge --squash` (or MAIN_GUARD_ALLOW_BASH=1)",
				};
			}
			return undefined;
		}

		const safePrefixRegexes = SAFE_BASH_PREFIXES.map((prefix) =>
			new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`),
		);
		const safeResetRegexes = protectedBranches.map((b) => new RegExp(`^git\\s+reset\\s+--hard\\s+origin/${b}\\b`));
		const SAFE_BASH_PATTERNS = [...safePrefixRegexes, ...safeResetRegexes];

		if (SAFE_BASH_PATTERNS.some((p) => p.test(cmd) || p.test(normalizedCmd))) {
			return undefined;
		}

		if (/\bgit\s+commit\b/.test(normalizedCmd)) {
			return {
				block: true,
				reason:
					`No commits on '${branch}' — use a feature branch/worktree.\n` +
					"  git checkout -b feature/<name>\n" +
					"  bd update <id> --claim\n",
			};
		}

		if (/\bgit\s+push\b/.test(normalizedCmd)) {
			const tokens = normalizedCmd.split(/\s+/);
			const lastToken = tokens[tokens.length - 1];
			const explicitProtected = protectedBranches.some((b) => lastToken === b || lastToken.endsWith(`:${b}`));
			const impliedProtected = tokens.length <= 3 && protectedBranches.includes(branch);

			if (explicitProtected || impliedProtected) {
				return {
					block: true,
					reason: `No direct push to '${branch}' — push a feature branch and open a PR.`,
				};
			}
			return undefined;
		}

		const handoff = sessionState?.worktreePath
			? `  Active worktree session recorded: ${sessionState.worktreePath}\n  (Current workaround) use feature branch flow until worktree bug is fixed.\n`
			: "  Exit: git checkout -b feature/<name>  (or: git switch -c feature/<name>)\n  Then: bd update <id> --claim\n";

		return {
			block: true,
			reason:
				`Bash restricted on '${branch}'. Allowed: read-only commands, gh, bd, git checkout -b, git switch -c.\n` +
				handoff +
				"  Override: MAIN_GUARD_ALLOW_BASH=1 <cmd>\n",
		};
	});
}
