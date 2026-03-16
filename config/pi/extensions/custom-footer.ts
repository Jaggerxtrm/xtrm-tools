/**
 * XTRM Custom Footer Extension
 *
 * Displays: XTRM brand, Model, Context%, CWD, Git branch, Beads chip
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

import * as path from "node:path";
import * as fs from "node:fs";
import { SubprocessRunner } from "./core/lib";

export default function (pi: ExtensionAPI) {
	interface BeadState {
		claimId: string | null;
		shortId: string | null;
		status: string | null;
		openCount: number;
		lastFetch: number;
	}

	const STATUS_ICONS: Record<string, string> = {
		open: "○",
		in_progress: "◐",
		blocked: "●",
		closed: "✓",
	};
	const STATUS_BG: Record<string, string> = {
		open: "\x1b[48;5;238m",
		in_progress: "\x1b[48;5;39m",
		blocked: "\x1b[48;5;88m",
	};

	let capturedCtx: any = null;
	let sessionId: string = "";
	let beadState: BeadState = { claimId: null, shortId: null, status: null, openCount: 0, lastFetch: 0 };
	let refreshing = false;
	let requestRender: (() => void) | null = null;
	const CACHE_TTL = 5000;

	const getCwd = () => capturedCtx?.cwd || process.cwd();
	const isBeadsProject = (cwd: string) => fs.existsSync(path.join(cwd, ".beads"));
	const getShortId = (id: string) => id.split("-").pop() ?? id;

	const refreshBeadState = async () => {
		if (refreshing || Date.now() - beadState.lastFetch < CACHE_TTL) return;
		const cwd = getCwd();
		if (!isBeadsProject(cwd)) return;
		if (!sessionId) return;
		refreshing = true;
		try {
			const claimResult = await SubprocessRunner.run("bd", ["kv", "get", `claimed:${sessionId}`], { cwd });
			const claimId = claimResult.code === 0 ? claimResult.stdout.trim() || null : null;

			let status: string | null = null;
			if (claimId) {
				const showResult = await SubprocessRunner.run("bd", ["show", claimId, "--json"], { cwd });
				if (showResult.code === 0) {
					try { status = JSON.parse(showResult.stdout)[0]?.status ?? null; } catch {}
				}
				if (status === "closed") {
					await SubprocessRunner.run("bd", ["kv", "clear", `claimed:${sessionId}`], { cwd });
					beadState = { claimId: null, shortId: null, status: null, openCount: beadState.openCount, lastFetch: Date.now() };
					requestRender?.();
					return;
				}
			}

			let openCount = 0;
			const listResult = await SubprocessRunner.run("bd", ["list"], { cwd });
			if (listResult.code === 0) {
				const m = listResult.stdout.match(/\((\d+)\s+open/);
				if (m) openCount = parseInt(m[1], 10);
			}

			beadState = { claimId, shortId: claimId ? getShortId(claimId) : null, status, openCount, lastFetch: Date.now() };
			requestRender?.();
		} catch {}
		finally { refreshing = false; }
	};

	const buildBeadChip = (): string => {
		const { claimId, shortId, status, openCount } = beadState;
		if (claimId && shortId && status) {
			const icon = STATUS_ICONS[status] ?? "?";
			const bg = STATUS_BG[status] ?? "\x1b[48;5;238m";
			return `${bg}\x1b[38;5;15m bd:${shortId}${icon} \x1b[0m`;
		}
		if (openCount > 0) {
			return `\x1b[48;5;238m\x1b[38;5;15m bd:${openCount}${STATUS_ICONS.open} \x1b[0m`;
		}
		return "";
	};

	pi.on("session_start", async (_event, ctx) => {
		capturedCtx = ctx;
		// Get session ID from sessionManager (UUID, consistent with hooks)
		sessionId = ctx.sessionManager?.getSessionId?.() ?? process.pid.toString();

		ctx.ui.setFooter((tui, theme, footerData) => {
			requestRender = () => tui.requestRender();
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose() { unsub(); requestRender = null; },
				invalidate() {},
				render(width: number): string[] {
					refreshBeadState().catch(() => {});

					const brand = "\x1b[1m" + theme.fg("accent", "XTRM") + "\x1b[22m";

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
					const modelChip = `\x1b[48;5;238m\x1b[38;5;15m ${modelId} \x1b[0m`;

					const sep = theme.fg("dim", " | ");

					const brandModel = `${brand} ${modelChip}`;
					const leftParts = [brandModel, usageStr, cwdStr];
					
					const beadChip = buildBeadChip();
					const branchWithChip = branchStr ? `${branchStr} ${beadChip}`.trim() : beadChip;
					if (branchWithChip) leftParts.push(branchWithChip);

					const left = leftParts.join(sep);
					return [truncateToWidth(left, width)];
				},
			};
		});
	});

	// Bust the bead cache immediately after any bd write
	pi.on("tool_result", async (event: any) => {
		const cmd = event?.input?.command;
		if (cmd && /\bbd\s+(close|update|create|claim)\b/.test(cmd)) {
			beadState.lastFetch = 0;
			setTimeout(() => refreshBeadState().catch(() => {}), 200);
		}
		return undefined;
	});
}
