/**
 * XTRM Custom Header Status (draft)
 *
 * Single-line header with stable context:
 * - XTRM
 * - MODEL
 * - USAGE
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	let enabled = true;

	const mountHeader = (ctx: any) => {
		if (!ctx?.hasUI) return;

		ctx.ui.setHeader((_tui: any, theme: any) => ({
			invalidate() {},
			render(width: number): string[] {
				const usage = ctx.getContextUsage?.();
				const pct = Math.max(0, Math.min(100, usage?.percent ?? 0));
				const usageColor = pct > 75 ? "error" : pct > 50 ? "warning" : "success";

				const brand = theme.fg("accent", "XTRM");
				const model = theme.fg("dim", `MODEL ${ctx.model?.id || "no-model"}`);
				const usageText = theme.fg(usageColor, `USAGE ${pct.toFixed(0)}%`);
				const sep = theme.fg("dim", " | ");

				return [truncateToWidth(`${brand}${sep}${model}${sep}${usageText}`, width)];
			},
		}));
	};

	pi.on("session_start", async (_event, ctx) => {
		if (enabled) mountHeader(ctx);
		return undefined;
	});

	pi.on("session_switch", async (_event, ctx) => {
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
