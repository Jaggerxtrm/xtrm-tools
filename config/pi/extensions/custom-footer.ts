/**
 * XTRM Custom Footer Extension
 *
 * Displays: XTRM brand, Turn count, Model, Context%, CWD, Git branch
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	let turnCount = 0;

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			
			return {
				dispose() { unsub(); },
				invalidate() {},
				render(width: number): string[] {
					const brand = theme.fg("accent", "XTRM");
					const turns = theme.fg("dim", `[Turn ${turnCount}]`);

					const usage = ctx.getContextUsage();
					const pct = usage?.percent ?? 0;
					const pctColor = pct > 75 ? "error" : pct > 50 ? "warning" : "success";
					const usageStr = theme.fg(pctColor, `${pct.toFixed(0)}%`);

					const parts = process.cwd().split("/");
					const short = parts.length > 2 ? parts.slice(-2).join("/") : process.cwd();
					const cwdStr = theme.fg("muted", `⌂ ${short}`);

					const branch = footerData.getGitBranch();
					const branchStr = branch ? theme.fg("accent", `⎇ ${branch}`) : "";

					const modelId = ctx.model?.id || "no-model";
					const modelStr = theme.fg("accent", modelId);

					const sep = theme.fg("dim", " | ");
					
					// Layout: XTRM [Turn 1] | model | 10% | ⌂ dir | ⎇ branch
					const leftParts = [`${brand} ${turns}`, modelStr, usageStr, cwdStr];
					if (branchStr) leftParts.push(branchStr);
					
					const left = leftParts.join(sep);
					return [truncateToWidth(left, width)];
				},
			};
		});
	});

	pi.on("turn_start", async () => {
		turnCount++;
	});

	pi.on("session_switch", async (event, _ctx) => {
		if (event.reason === "new") {
			turnCount = 0;
		}
	});
}
