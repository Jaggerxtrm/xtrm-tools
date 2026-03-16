import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let turnCount = 0;

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI) {
			const theme = ctx.ui.theme;
			const brand = theme.fg("accent", "XTRM");
			ctx.ui.setStatus("xtrm-brand", `${brand} 🚀`);
		}
	});

	pi.on("turn_start", async (_event, ctx) => {
		turnCount++;
		if (ctx.hasUI) {
			const theme = ctx.ui.theme;
			ctx.ui.setStatus("xtrm-turns", theme.fg("dim", `[Turn ${turnCount}]`));
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (ctx.hasUI) {
			ctx.ui.setStatus("xtrm-brand", undefined);
			ctx.ui.setStatus("xtrm-turns", undefined);
		}
	});
}
