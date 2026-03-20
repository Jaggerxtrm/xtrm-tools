/**
 * XTRM Custom Footer Extension
 *
 * Footer keeps operational context only:
 * - Beads chip (first)
 * - CWD
 * - Git branch
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

import { SubprocessRunner, EventAdapter } from "./core/lib";

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

	const CHIP_BG_NEUTRAL = "\x1b[48;5;238m";
	const CHIP_BG_ACTIVE = "\x1b[48;5;39m";
	const CHIP_BG_BLOCKED = "\x1b[48;5;88m";
	const CHIP_FG = "\x1b[38;5;15m";
	const CHIP_RESET = "\x1b[0m";
	const chip = (text: string, bg = CHIP_BG_NEUTRAL): string => `${bg}${CHIP_FG} ${text} ${CHIP_RESET}`;

	const STATUS_BG: Record<string, string> = {
		open: CHIP_BG_NEUTRAL,
		in_progress: CHIP_BG_ACTIVE,
		blocked: CHIP_BG_BLOCKED,
	};

	let capturedCtx: any = null;
	let sessionId = "";
	let beadState: BeadState = { claimId: null, shortId: null, status: null, openCount: 0, lastFetch: 0 };
	let refreshing = false;
	let requestRender: (() => void) | null = null;
	const CACHE_TTL = 5000;

	const getCwd = () => capturedCtx?.cwd || process.cwd();
	const getShortId = (id: string) => id.split("-").pop() ?? id;

	const refreshBeadState = async () => {
		if (refreshing || Date.now() - beadState.lastFetch < CACHE_TTL) return;
		const cwd = getCwd();
		if (!EventAdapter.isBeadsProject(cwd)) return;
		if (!sessionId) return;
		refreshing = true;
		try {
			const claimResult = await SubprocessRunner.run("bd", ["kv", "get", `claimed:${sessionId}`], { cwd });
			const claimId = claimResult.code === 0 ? claimResult.stdout.trim() || null : null;

			let status: string | null = null;
			if (claimId) {
				const showResult = await SubprocessRunner.run("bd", ["show", claimId, "--json"], { cwd });
				if (showResult.code === 0) {
					try {
						status = JSON.parse(showResult.stdout)[0]?.status ?? null;
					} catch {}
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
		} catch {
			// ignore footer refresh errors
		} finally {
			refreshing = false;
		}
	};

	const buildBeadChip = (): string => {
		const { claimId, shortId, status, openCount } = beadState;
		if (claimId && shortId && status) {
			const icon = STATUS_ICONS[status] ?? "?";
			const bg = STATUS_BG[status] ?? CHIP_BG_NEUTRAL;
			return chip(`bd:${shortId}${icon}`, bg);
		}
		if (openCount > 0) return chip(`bd:${openCount}${STATUS_ICONS.open}`);
		return "";
	};

	pi.on("session_start", async (_event, ctx) => {
		capturedCtx = ctx;
		sessionId = ctx.sessionManager?.getSessionId?.() ?? ctx.sessionId ?? ctx.session_id ?? process.pid.toString();

		ctx.ui.setFooter((tui, theme, footerData) => {
			requestRender = () => tui.requestRender();
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose() {
					unsub();
					requestRender = null;
				},
				invalidate() {},
				render(width: number): string[] {
					refreshBeadState().catch(() => {});

					const sep = theme.fg("dim", " | ");
					const beadChip = buildBeadChip();
					const cwdPath = capturedCtx?.cwd || process.cwd();
					const parts = cwdPath.split("/");
					const short = parts.length > 2 ? parts.slice(-2).join("/") : cwdPath;
					const cwdStr = theme.fg("muted", `⌂ ${short}`);
					const branch = footerData.getGitBranch();
					const branchStr = branch ? theme.fg("accent", `⎇ ${branch}`) : "";

					const leftParts = [beadChip, cwdStr, branchStr].filter(Boolean);
					return [truncateToWidth(leftParts.join(sep), width)];
				},
			};
		});
	});

	pi.on("tool_result", async (event: any) => {
		const cmd = event?.input?.command;
		if (cmd && /\bbd\s+(close|update|create|claim)\b/.test(cmd)) {
			beadState.lastFetch = 0;
			setTimeout(() => refreshBeadState().catch(() => {}), 200);
		}
		return undefined;
	});
}
