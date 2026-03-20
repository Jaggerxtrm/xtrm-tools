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

function isWorktree(cwd: string): boolean {
	return cwd.includes("/.xtrm/worktrees/") || cwd.includes("/.claude/worktrees/");
}

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();

	// Claim sync: notify when a bd update --claim command is run.
	pi.on("tool_result", async (event, ctx) => {
		if (!isBashToolResult(event)) return undefined;
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;

		const command = event.input.command || "";
		const { isClaim, issueId } = isClaimCommand(command);
		if (!isClaim || !issueId) return undefined;

		const text = `\n\nSession Flow: claimed ${issueId}. Work in this session is tracked.`;
		return { content: [...event.content, { type: "text", text }] };
	});

	// Stop gate: block agent end if there is an in_progress claimed issue.
	// Also remind to run `xt end` when session ends inside a worktree.
	pi.on("agent_end", async (_event, ctx) => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;

		const inProgressResult = await SubprocessRunner.run(
			"bd",
			["list", "--status=in_progress"],
			{ cwd },
		);
		if (inProgressResult.code === 0 && inProgressResult.stdout) {
			const output = inProgressResult.stdout;
			const m = output.match(/Total:\s*\d+\s+issues?\s*\((\d+)\s+open,\s*(\d+)\s+in progress\)/);
			const inProgressCount = m ? parseInt(m[2], 10) : 0;
			if (inProgressCount > 0) {
				const idMatch = output.match(/^\s*([a-zA-Z0-9._-]+)\s+in_progress/m);
				const issueId = idMatch ? idMatch[1] : "<id>";
				pi.sendUserMessage(
					`Stop blocked: close your issue first: bd close ${issueId}`,
				);
				return undefined;
			}
		}

		if (isWorktree(cwd)) {
			pi.sendUserMessage(
				"Run `xt end` to create a PR and clean up this worktree.",
			);
		}

		return undefined;
	});
}
