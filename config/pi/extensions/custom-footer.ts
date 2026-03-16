/**
 * XTRM Custom Footer Extension
 *
 * Displays: XTRM brand, Turn count, Model, Context%, CWD, Git branch
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

import * as path from "node:path";
import * as fs from "node:fs";
import { SubprocessRunner } from "./core/lib";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const getCwd = () => (ctx as any).cwd || process.cwd();
		const isBeadsProject = (cwd: string) => fs.existsSync(path.join(cwd, ".beads"));
		const getShortId = (id: string) => id.split("-").pop() ?? id;

		const STATUS_ICONS: Record<string, string> = {
			open: "○",
			in_progress: "◐",
			blocked: "●",
			closed: "✓",
		};
		const STATUS_BG: Record<string, string> = {
			open: "\x1b[48;5;238m",
			in_progress: "\x1b[48;5;28m",
			blocked: "\x1b[48;5;88m",
		};

		interface BeadState {
			claimId: string | null;
			shortId: string | null;
			status: string | null;
			openCount: number;
			lastFetch: number;
		}

		let beadState: BeadState = { claimId: null, shortId: null, status: null, openCount: 0, lastFetch: 0 };
		let refreshing = false;
		const CACHE_TTL = 5000;

		const refreshBeadState = async () => {
			if (refreshing || Date.now() - beadState.lastFetch < CACHE_TTL) return;
			const cwd = getCwd();
			if (!isBeadsProject(cwd)) return;
			refreshing = true;
			try {
				const sessionId = ctx.sessionManager.sessionId;

				const claimResult = await SubprocessRunner.run("bd", ["kv", "get", `claimed:${sessionId}`], { cwd });
				const claimId = claimResult.code === 0 ? claimResult.stdout.trim() || null : null;

				let status: string | null = null;
				if (claimId) {
					const showResult = await SubprocessRunner.run("bd", ["show", claimId, "--json"], { cwd });
					if (showResult.code === 0) {
						try { status = JSON.parse(showResult.stdout).status ?? null; } catch {}
					}
					if (status === "closed") {
						await SubprocessRunner.run("bd", ["kv", "clear", `claimed:${sessionId}`], { cwd });
						beadState = { claimId: null, shortId: null, status: null, openCount: beadState.openCount, lastFetch: Date.now() };
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

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose() { unsub(); },
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
					const modelStr = theme.fg("accent", modelId);

					const sep = theme.fg("dim", " | ");

					// Layout: XTRM | model | 10% | ⌂ dir | ⎇ branch | bd:xxx◐
					const leftParts = [brand, modelStr, usageStr, cwdStr];
					if (branchStr) leftParts.push(branchStr);

					const beadChip = buildBeadChip();
					if (beadChip) leftParts.push(beadChip);

					const left = leftParts.join(sep);
					return [truncateToWidth(left, width)];
				},
			};
		});
	});
}
