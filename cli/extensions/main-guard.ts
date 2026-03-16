import type { ExtensionAPI, ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, EventAdapter, Logger } from "./core";

const logger = new Logger({ namespace: "main-guard" });

export default function (pi: ExtensionAPI) {
	const getProtectedBranches = (): string[] => {
		const env = process.env.MAIN_GUARD_PROTECTED_BRANCHES;
		if (env) return env.split(",").map(b => b.trim()).filter(Boolean);
		return ["main", "master"];
	};

	const getCurrentBranch = async (cwd: string): Promise<string | null> => {
		const result = await SubprocessRunner.run("git", ["branch", "--show-current"], { cwd });
		if (result.code === 0) return result.stdout;
		return null;
	};

	pi.on("tool_call", async (event, ctx) => {
		const cwd = ctx.cwd || process.cwd();
		const protectedBranches = getProtectedBranches();
		const branch = await getCurrentBranch(cwd);

		if (!branch || !protectedBranches.includes(branch)) {
			return undefined;
		}

		// 1. Mutating File Tools
		if (EventAdapter.isMutatingFileTool(event)) {
			const reason = `On protected branch '${branch}'. Checkout a feature branch first: \`git checkout -b feature/<name>\``;
			if (ctx.hasUI) {
				ctx.ui.notify(`Main-Guard: Blocked edit on ${branch}`, "error");
			}
			return { block: true, reason };
		}

		// 2. Bash Commands
		if (isToolCallEventType("bash", event)) {
			const cmd = event.input.command.trim();

			// Emergency override
			if (process.env.MAIN_GUARD_ALLOW_BASH === "1") return undefined;

			// Enforce squash-only PR merges
			if (/^gh\s+pr\s+merge\b/.test(cmd)) {
				if (!/--squash\b/.test(cmd)) {
					const reason = "Squash only: use `gh pr merge --squash` (or MAIN_GUARD_ALLOW_BASH=1)";
					return { block: true, reason };
				}
				return undefined;
			}

			// Safe allowlist
			const SAFE_BASH_PATTERNS = [
				/^git\s+(status|log|diff|branch|show|describe|fetch|remote|config)\b/,
				/^git\s+pull\b/,
				/^git\s+stash\b/,
				/^git\s+worktree\b/,
				/^git\s+checkout\s+-b\s+\S+/,
				/^git\s+switch\s+-c\s+\S+/,
				...protectedBranches.map(b => new RegExp(`^git\\s+reset\\s+--hard\\s+origin/${b}\\b`)),
				/^gh\s+/,
				/^bd\s+/,
				/^touch\s+\.beads\//,
			];

			if (SAFE_BASH_PATTERNS.some(p => p.test(cmd))) {
				return undefined;
			}

			// Specific blocks
			if (/\bgit\s+commit\b/.test(cmd)) {
				return { block: true, reason: `No commits on '${branch}' — use a feature branch.` };
			}

			if (/\bgit\s+push\b/.test(cmd)) {
				const tokens = cmd.split(/\s+/);
				const lastToken = tokens[tokens.length - 1];
				const explicitProtected = protectedBranches.some(b => lastToken === b || lastToken.endsWith(`:${b}`));
				const impliedProtected = tokens.length <= 3 && protectedBranches.includes(branch);
				
				if (explicitProtected || impliedProtected) {
					return { block: true, reason: `No direct push to '${branch}' — push a feature branch and open a PR.` };
				}
				return undefined;
			}

			// Default deny
			const reason = `Bash restricted on '${branch}'. Allowed: git status/log/diff/pull/stash, gh, bd.\n  Exit: git checkout -b feature/<name>`;
			if (ctx.hasUI) {
				ctx.ui.notify("Main-Guard: Command blocked", "error");
			}
			return { block: true, reason };
		}

		return undefined;
	});
}
