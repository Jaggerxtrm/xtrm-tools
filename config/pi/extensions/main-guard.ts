import type { ExtensionAPI, ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, EventAdapter, Logger } from "./core/lib";
import { SAFE_BASH_PREFIXES, DANGEROUS_BASH_PATTERNS } from "./core/guard-rules";

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

	const protectedPaths = [".env", ".git/", "node_modules/"];

	pi.on("tool_call", async (event, ctx) => {
		const cwd = ctx.cwd || process.cwd();
		
		// 1. Safety Check: Protected Paths (Global)
		if (EventAdapter.isMutatingFileTool(event)) {
			const path = EventAdapter.extractPathFromToolInput(event, cwd);
			if (path && protectedPaths.some((p) => path.includes(p))) {
				const reason = `Path "${path}" is protected. Edits to sensitive system files are restricted.`;
				if (ctx.hasUI) {
					ctx.ui.notify(`Safety: Blocked edit to protected path`, "error");
				}
				return { block: true, reason };
			}
		}

		// 2. Safety Check: Dangerous Commands (Global)
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

		// 3. Main-Guard: Branch Protection
		const protectedBranches = getProtectedBranches();
		const branch = await getCurrentBranch(cwd);

		if (branch && protectedBranches.includes(branch)) {
			// A. Mutating File Tools on Main
			if (EventAdapter.isMutatingFileTool(event)) {
				const reason = `On protected branch '${branch}' — start on a feature branch and claim an issue.\n  git checkout -b feature/<name>\n  bd update <id> --claim\n`;
				if (ctx.hasUI) {
					ctx.ui.notify(`Main-Guard: Blocked edit on ${branch}`, "error");
				}
				return { block: true, reason };
			}

			// B. Bash Commands on Main
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
				const safePrefixRegexes = SAFE_BASH_PREFIXES.map((prefix) =>
					new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
				);
				const safeResetRegexes = protectedBranches.map((b) => new RegExp(`^git\\s+reset\\s+--hard\\s+origin/${b}\\b`));
				const SAFE_BASH_PATTERNS = [...safePrefixRegexes, ...safeResetRegexes];

				if (SAFE_BASH_PATTERNS.some(p => p.test(cmd))) {
					return undefined;
				}

				// Specific blocks
				if (/\bgit\s+commit\b/.test(cmd)) {
					return { block: true, reason: `No commits on '${branch}' — use a feature branch.\n  git checkout -b feature/<name>\n  bd update <id> --claim\n` };
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
				const reason = `Bash restricted on '${branch}'. Allowed: git status/log/diff/pull/stash, gh, bd.\n  Exit: git checkout -b feature/<name>\n  Then: bd update <id> --claim\n  Override: MAIN_GUARD_ALLOW_BASH=1 <cmd>\n`;
				if (ctx.hasUI) {
					ctx.ui.notify("Main-Guard: Command blocked", "error");
				}
				return { block: true, reason };
			}
		}

		return undefined;
	});
}
