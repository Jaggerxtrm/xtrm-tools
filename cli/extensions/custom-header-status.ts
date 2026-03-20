/**
 * XTRM Custom Header Status (draft)
 *
 * Moves stable session context to top header:
 * - XTRM brand
 * - active model
 * - context usage
 *
 * Optional commands:
 * - /header-status-on
 * - /header-status-off
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	let enabled = true;
	let lastCwd = process.cwd();

	const shortCwd = (cwd: string): string => {
		const parts = cwd.split("/").filter(Boolean);
		if (parts.length <= 2) return cwd;
		return `/${parts.slice(-2).join("/")}`;
	};

	const mountHeader = (ctx: any) => {
		if (!ctx?.hasUI) return;

		ctx.ui.setHeader((_tui: any, theme: any) => ({
			invalidate() {},
			render(width: number): string[] {
				const usage = ctx.getContextUsage?.();
				const pct = Math.max(0, Math.min(100, usage?.percent ?? 0));
				const usageColor = pct > 75 ? "error" : pct > 50 ? "warning" : "success";

				const brand = theme.fg("accent", "XTRM");
				const model = theme.fg("dim", ctx.model?.id || "no-model");
				const usageText = theme.fg(usageColor, `${pct.toFixed(0)}%`);
				const cwdText = theme.fg("muted", `⌂ ${shortCwd(lastCwd)}`);

				const line1 = truncateToWidth(`${brand}  ${model}`, width);
				const line2 = truncateToWidth(`${usageText}  ${cwdText}`, width);
				return [line1, line2];
			},
		}));
	};

	pi.on("session_start", async (_event, ctx) => {
		lastCwd = ctx?.cwd || process.cwd();
		if (enabled) mountHeader(ctx);
		return undefined;
	});

	pi.on("session_switch", async (_event, ctx) => {
		lastCwd = ctx?.cwd || lastCwd;
		if (enabled) mountHeader(ctx);
		return undefined;
	});

	pi.registerCommand("header-status-on", {
		description: "Enable XTRM status header",
		handler: async (_args, ctx) => {
			enabled = true;
			mountHeader(ctx);
			ctx.ui.notify("Header status enabled", "info");
		},
	});

	pi.registerCommand("header-status-off", {
		description: "Disable XTRM status header (restore built-in)",
		handler: async (_args, ctx) => {
			enabled = false;
			ctx.ui.setHeader(undefined);
			ctx.ui.notify("Built-in header restored", "info");
		},
	});
}
