import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, Logger } from "./core/lib";

const logger = new Logger({ namespace: "main-guard-post-push" });

export default function (pi: ExtensionAPI) {
	const getProtectedBranches = (): string[] => {
		const env = process.env.MAIN_GUARD_PROTECTED_BRANCHES;
		if (env) return env.split(",").map(b => b.trim()).filter(Boolean);
		return ["main", "master"];
	};

	pi.on("tool_result", async (event, ctx) => {
		const cwd = ctx.cwd || process.cwd();
		if (!isBashToolResult(event) || event.isError) return undefined;

		const cmd = event.input.command.trim();
		if (!/\bgit\s+push\b/.test(cmd)) return undefined;

		// Check if we pushed to a protected branch
		const protectedBranches = getProtectedBranches();
		const tokens = cmd.split(/\s+/);
		const lastToken = tokens[tokens.length - 1];
		if (protectedBranches.some(b => lastToken === b || lastToken.endsWith(`:${b}`))) {
			return undefined;
		}

		// Success! Suggest PR workflow
		const reminder = "\n\n**Main-Guard**: Push successful. Next steps:\n" +
			"  1. `gh pr create --fill` (if not already open)\n" +
			"  2. `gh pr merge --squash` (once approved)\n" +
			"  3. `git checkout main && git reset --hard origin/main` (sync local)";

		const newContent = [...event.content];
		newContent.push({ type: "text", text: reminder });

		if (ctx.hasUI) {
			ctx.ui.notify("Main-Guard: Suggesting PR workflow", "info");
		}

		return { content: newContent };
	});
}
