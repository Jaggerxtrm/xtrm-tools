/**
 * XTRM Custom Footer Extension
 *
 * Displays: XTRM brand, model/context, host, cwd, git branch/status, beads state.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { basename, relative } from "node:path";
import { hostname } from "node:os";

import { SubprocessRunner, EventAdapter } from "../core/lib";

export default function (pi: ExtensionAPI) {
	interface BeadState {
		claimId: string | null;
		shortId: string | null;
		claimTitle: string | null;
		status: string | null;
		openCount: number;
		lastFetch: number;
	}

	interface RuntimeState {
		host: string;
		displayDir: string;
		branch: string | null;
		gitStatus: string;
		venv: string | null;
		lastFetch: number;
	}

	const STATUS_ICONS: Record<string, string> = {
		open: "○",
		in_progress: "◐",
		blocked: "●",
		closed: "✓",
	};

	// Chip background colours (raw ANSI — theme has no bg() API)
	const CHIP_BG_NEUTRAL = "\x1b[48;5;238m";
	const CHIP_BG_ACTIVE = "\x1b[48;5;39m";
	const CHIP_BG_BLOCKED = "\x1b[48;5;88m";
	const CHIP_FG = "\x1b[38;5;15m";
	const CHIP_RESET = "\x1b[0m";

	const STATUS_BG: Record<string, string> = {
		open: CHIP_BG_NEUTRAL,
		in_progress: CHIP_BG_ACTIVE,
		blocked: CHIP_BG_BLOCKED,
	};

	const chip = (text: string, bg = CHIP_BG_NEUTRAL): string => `${bg}${CHIP_FG} ${text} ${CHIP_RESET}`;

	let capturedCtx: any = null;
	let sessionId = "";
	let requestRender: (() => void) | null = null;

	const CACHE_TTL = 5000;
	let refreshingBeads = false;
	let refreshingRuntime = false;

	let beadState: BeadState = {
		claimId: null,
		shortId: null,
		claimTitle: null,
		status: null,
		openCount: 0,
		lastFetch: 0,
	};

	let runtimeState: RuntimeState = {
		host: hostname().split(".")[0] || "host",
		displayDir: process.cwd(),
		branch: null,
		gitStatus: "",
		venv: process.env.VIRTUAL_ENV ? basename(process.env.VIRTUAL_ENV) : null,
		lastFetch: 0,
	};

	const getCwd = () => capturedCtx?.cwd || process.cwd();
	const getShortId = (id: string) => id.split("-").pop() ?? id;

	const parseGitFlags = (porcelain: string): string => {
		let modified = false;
		let staged = false;
		let deleted = false;
		for (const line of porcelain.split("\n").filter(Boolean)) {
			if (/^ M|^AM|^MM/.test(line)) modified = true;
			if (/^A |^M /.test(line)) staged = true;
			if (/^ D|^D /.test(line)) deleted = true;
		}
		return `${modified ? "*" : ""}${staged ? "+" : ""}${deleted ? "-" : ""}`;
	};

	const refreshRuntimeState = async () => {
		if (refreshingRuntime || Date.now() - runtimeState.lastFetch < CACHE_TTL) return;
		refreshingRuntime = true;
		const cwd = getCwd();
		try {
			const host = hostname().split(".")[0] || "host";
			const venv = process.env.VIRTUAL_ENV ? basename(process.env.VIRTUAL_ENV) : null;
			const rootResult = await SubprocessRunner.run("git", ["rev-parse", "--show-toplevel"], { cwd });
			const repoRoot = rootResult.code === 0 ? rootResult.stdout.trim() : null;

			const displayDir = repoRoot
				? (() => {
					const relPath = relative(repoRoot, cwd) || ".";
					return relPath === "." ? basename(repoRoot) : `${basename(repoRoot)}/${relPath}`;
				  })()
				: (() => {
					const parts = cwd.split("/");
					return parts.length > 2 ? parts.slice(-2).join("/") : cwd;
				  })();

			let branch: string | null = null;
			let gitStatus = "";
			if (repoRoot) {
				const branchResult = await SubprocessRunner.run("git", ["branch", "--show-current"], { cwd });
				branch = branchResult.code === 0 ? branchResult.stdout.trim() || null : null;

				const porcelainResult = await SubprocessRunner.run("git", ["--no-optional-locks", "status", "--porcelain"], { cwd });
				const baseFlags = porcelainResult.code === 0 ? parseGitFlags(porcelainResult.stdout) : "";

				let upstreamFlags = "";
				const abResult = await SubprocessRunner.run(
					"git",
					["--no-optional-locks", "rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
					{ cwd },
				);
				if (abResult.code === 0) {
					const [behindRaw, aheadRaw] = abResult.stdout.trim().split(/\s+/);
					const behind = Number(behindRaw || 0);
					const ahead = Number(aheadRaw || 0);
					if (ahead > 0 && behind > 0) upstreamFlags = "↕";
					else if (ahead > 0) upstreamFlags = "↑";
					else if (behind > 0) upstreamFlags = "↓";
				}

				gitStatus = `${baseFlags}${upstreamFlags}`;
			}

			runtimeState = {
				host,
				displayDir,
				branch,
				gitStatus,
				venv,
				lastFetch: Date.now(),
			};
			requestRender?.();
		} catch {
			// Fail soft — keep last known runtime state.
		} finally {
			refreshingRuntime = false;
		}
	};

	const refreshBeadState = async () => {
		if (refreshingBeads || Date.now() - beadState.lastFetch < CACHE_TTL) return;
		const cwd = getCwd();
		if (!EventAdapter.isBeadsProject(cwd) || !sessionId) return;
		refreshingBeads = true;
		try {
			const claimResult = await SubprocessRunner.run("bd", ["kv", "get", `claimed:${sessionId}`], { cwd });
			const claimId = claimResult.code === 0 ? claimResult.stdout.trim() || null : null;

			let status: string | null = null;
			let claimTitle: string | null = null;
			if (claimId) {
				const showResult = await SubprocessRunner.run("bd", ["show", claimId, "--json"], { cwd });
				if (showResult.code === 0) {
					try {
						const issue = JSON.parse(showResult.stdout)?.[0];
						status = issue?.status ?? null;
						claimTitle = issue?.title ?? null;
					} catch {
						// keep nulls
					}
				}
				if (status === "closed") {
					await SubprocessRunner.run("bd", ["kv", "clear", `claimed:${sessionId}`], { cwd });
					beadState = {
						claimId: null,
						shortId: null,
						claimTitle: null,
						status: null,
						openCount: beadState.openCount,
						lastFetch: Date.now(),
					};
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

			beadState = {
				claimId,
				shortId: claimId ? getShortId(claimId) : null,
				claimTitle,
				status,
				openCount,
				lastFetch: Date.now(),
			};
			requestRender?.();
		} catch {
			// Fail soft — keep last known beads state.
		} finally {
			refreshingBeads = false;
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

	const buildIssueLine = (width: number, theme: any): string => {
		const { shortId, claimTitle, status, openCount } = beadState;
		if (shortId && claimTitle && status) {
			const icon = STATUS_ICONS[status] ?? "◐";
			const prefix = `${icon} ${shortId} `;
			const title = theme.fg("muted", claimTitle);
			return truncateToWidth(`${prefix}${title}`, width);
		}
		if (openCount > 0) {
			return truncateToWidth(`○ ${openCount} open`, width);
		}
		return truncateToWidth("○ no open issues", width);
	};

	let footerReapplyTimer: ReturnType<typeof setTimeout> | null = null;

	const applyCustomFooter = (ctx: any) => {
		capturedCtx = ctx;
		ctx.ui.setFooter((tui, theme, footerData) => {
			requestRender = () => tui.requestRender();
			const unsub = footerData.onBranchChange(() => {
				runtimeState.lastFetch = 0;
				tui.requestRender();
			});

			return {
				dispose() {
					unsub();
					requestRender = null;
				},
				invalidate() {},
				render(width: number): string[] {
					refreshRuntimeState().catch(() => {});
					refreshBeadState().catch(() => {});

					const BOLD = "\x1b[1m";
					const BOLD_OFF = "\x1b[22m";
					const brand = `${BOLD}${theme.fg("accent", "XTRM")}${BOLD_OFF}`;

					const usage = ctx.getContextUsage();
					const pct = usage?.percent ?? 0;
					const pctColor = pct > 75 ? "error" : pct > 50 ? "warning" : "success";
					const usageStr = theme.fg(pctColor, `[${pct.toFixed(0)}%]`);

					const modelId = ctx.model?.id || "no-model";
					const modelStr = `${modelId} ${usageStr}`;

					const branchFromFooter = footerData.getGitBranch();
					const branch = runtimeState.branch || branchFromFooter;
					const branchWithStatus = branch
						? runtimeState.gitStatus
							? `${branch} (${runtimeState.gitStatus})`
							: branch
						: "";
					const branchStr = branchWithStatus ? theme.fg("muted", branchWithStatus) : "";
					const hostStr = theme.fg("muted", runtimeState.host);
					const cwdStr = `${BOLD}${runtimeState.displayDir}${BOLD_OFF}`;
					const venvStr = runtimeState.venv ? theme.fg("muted", `(${runtimeState.venv})`) : "";
					const beadChip = buildBeadChip();

					const line1Parts = [brand, modelStr, hostStr, cwdStr];
					if (branchStr) line1Parts.push(branchStr);
					if (venvStr) line1Parts.push(venvStr);
					if (beadChip) line1Parts.push(beadChip);

					const line1 = truncateToWidth(line1Parts.join(" "), width);
					const line2 = buildIssueLine(width, theme);
					return [line1, line2];
				},
			};
		});
	};

	const scheduleFooterReapply = (ctx: any, delayMs = 40) => {
		if (footerReapplyTimer) clearTimeout(footerReapplyTimer);
		footerReapplyTimer = setTimeout(() => {
			applyCustomFooter(ctx);
			footerReapplyTimer = null;
		}, delayMs);
	};

	pi.on("session_start", async (_event, ctx) => {
		capturedCtx = ctx;
		sessionId = ctx.sessionManager?.getSessionId?.() || ctx.sessionId || ctx.session_id || process.pid.toString();
		runtimeState.lastFetch = 0;
		beadState.lastFetch = 0;
		applyCustomFooter(ctx);
		scheduleFooterReapply(ctx);
	});

	pi.on("session_switch", async (_event, ctx) => {
		runtimeState.lastFetch = 0;
		scheduleFooterReapply(ctx);
	});

	pi.on("session_fork", async (_event, ctx) => {
		runtimeState.lastFetch = 0;
		scheduleFooterReapply(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		runtimeState.lastFetch = 0;
		scheduleFooterReapply(ctx);
	});

	pi.on("session_shutdown", async () => {
		if (footerReapplyTimer) {
			clearTimeout(footerReapplyTimer);
			footerReapplyTimer = null;
		}
	});

	// Bust caches immediately after relevant writes
	pi.on("tool_result", async (event: any) => {
		const cmd = event?.input?.command;
		if (!cmd) return undefined;

		if (/\bbd\s+(close|update|create|claim)\b/.test(cmd)) {
			beadState.lastFetch = 0;
			setTimeout(() => refreshBeadState().catch(() => {}), 200);
		}
		if (/\bgit\s+/.test(cmd)) {
			runtimeState.lastFetch = 0;
			setTimeout(() => refreshRuntimeState().catch(() => {}), 200);
		}
		return undefined;
	});
}
