/**
 * Ralph Wiggum - Long-running agent loops for iterative development.
 * Adapted for XTRM project with beads and GitNexus integration.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	RALPH_DIR,
	COMPLETE_MARKER,
	DEFAULT_TEMPLATE,
	DEFAULT_REFLECT_INSTRUCTIONS,
	ralphDir,
	archiveDir,
	sanitize,
	getPath,
	ensureDir,
	tryDelete,
	tryRead,
	tryRemoveDir,
	migrateState,
	loadState,
	saveState,
	listLoops,
	buildPrompt,
	parseArgs,
} from "./utils.js";
import type { LoopState } from "./types.js";

const STATUS_ICONS = { active: "▶", paused: "⏸", completed: "✓" };

// bd helpers (inline to avoid import issues)
async function runBd(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
	return new Promise((resolve) => {
		const { spawn } = require("node:child_process");
		const proc = spawn("bd", args, { cwd, shell: true });
		let stdout = "";
		let stderr = "";
		proc.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
		proc.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
		proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
		proc.on("error", () => resolve({ stdout, stderr, code: 1 }));
	});
}

async function bdShow(issueId: string, cwd: string): Promise<any> {
	const result = await runBd(["show", issueId, "--json"], cwd);
	if (result.code !== 0) return null;
	try {
		const parsed = JSON.parse(result.stdout);
		return parsed?.[0] || parsed || null;
	} catch {
		return null;
	}
}

async function bdClose(issueId: string, reason: string, cwd: string): Promise<boolean> {
	const result = await runBd(["close", issueId, "--reason", `"${reason.replace(/"/g, '\\"')}"`], cwd);
	return result.code === 0;
}

export default function (pi: ExtensionAPI) {
	let currentLoop: string | null = null;

	const getCwd = (ctx: ExtensionContext) => ctx.cwd || process.cwd();

	function pauseLoop(ctx: ExtensionContext, state: LoopState, message?: string): void {
		state.status = "paused";
		saveState(getCwd(ctx), state);
		currentLoop = null;
		updateUI(ctx);
		if (message && ctx.hasUI) ctx.ui.notify(message, "info");
	}

	function completeLoop(ctx: ExtensionContext, state: LoopState, banner: string): void {
		state.status = "completed";
		state.completedAt = new Date().toISOString();
		saveState(getCwd(ctx), state);
		currentLoop = null;
		updateUI(ctx);
		pi.sendUserMessage(banner);
	}

	function stopLoop(ctx: ExtensionContext, state: LoopState, message?: string): void {
		state.status = "completed";
		state.completedAt = new Date().toISOString();
		saveState(getCwd(ctx), state);
		currentLoop = null;
		updateUI(ctx);
		if (message && ctx.hasUI) ctx.ui.notify(message, "info");
	}

	function formatLoop(l: LoopState): string {
		const status = `${STATUS_ICONS[l.status]} ${l.status}`;
		const iter = l.maxIterations > 0 ? `${l.iteration}/${l.maxIterations}` : `${l.iteration}`;
		const issue = l.linkedIssueId ? ` [${l.linkedIssueId}]` : "";
		return `${l.name}${issue}: ${status} (iteration ${iter})`;
	}

	function updateUI(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		const cwd = getCwd(ctx);
		const state = currentLoop ? loadState(cwd, currentLoop) : null;
		if (!state) {
			ctx.ui.setStatus("ralph", undefined);
			ctx.ui.setWidget("ralph", undefined);
			return;
		}
		const { theme } = ctx.ui;
		const maxStr = state.maxIterations > 0 ? `/${state.maxIterations}` : "";
		ctx.ui.setStatus("ralph", theme.fg("accent", `🔄 ${state.name} (${state.iteration}${maxStr})`));
		const lines = [
			theme.fg("accent", theme.bold("Ralph Wiggum")),
			theme.fg("muted", `Loop: ${state.name}`),
			theme.fg("dim", `Status: ${STATUS_ICONS[state.status]} ${state.status}`),
			theme.fg("dim", `Iteration: ${state.iteration}${maxStr}`),
		];
		if (state.linkedIssueId) lines.push(theme.fg("dim", `Linked: ${state.linkedIssueId}`));
		if (state.itemsPerIteration > 0) lines.push(theme.fg("dim", `Items/turn: ${state.itemsPerIteration}`));
		if (state.reflectEvery > 0) {
			const next = state.reflectEvery - ((state.iteration - 1) % state.reflectEvery);
			lines.push(theme.fg("dim", `Next reflection: ${next} iterations`));
		}
		lines.push("");
		lines.push(theme.fg("warning", "ESC pauses | /ralph-stop ends loop"));
		ctx.ui.setWidget("ralph", lines);
	}

	const commands: Record<string, (rest: string, ctx: ExtensionContext) => void> = {
		start(rest, ctx) {
			const cwd = getCwd(ctx);
			const args = parseArgs(rest);
			if (!args.name) {
				ctx.ui.notify("Usage: /ralph start <name> [--from-issue <id>] [--items-per-iteration N] [--reflect-every N] [--max-iterations N]", "warning");
				return;
			}
			const isPath = args.name.includes("/") || args.name.includes("\\");
			const path = require("path");
			const fs = require("fs");
			const loopName = isPath ? sanitize(path.basename(args.name, path.extname(args.name))) : args.name;
			const taskFile = isPath ? args.name : path.join(RALPH_DIR, `${loopName}.md`);
			const existing = loadState(cwd, loopName);
			if (existing?.status === "active") {
				ctx.ui.notify(`Loop "${loopName}" already active. Use /ralph resume`, "warning");
				return;
			}
			const fullPath = path.resolve(cwd, taskFile);
			if (!fs.existsSync(fullPath)) {
				ensureDir(fullPath);
				fs.writeFileSync(fullPath, DEFAULT_TEMPLATE, "utf-8");
				ctx.ui.notify(`Created task file: ${taskFile}`, "info");
			}
			let linkedIssueId: string | undefined;
			if (args.fromIssue) {
				const issueData = bdShow(args.fromIssue, cwd);
				if (issueData) {
					linkedIssueId = args.fromIssue;
					const issueContent = `# Task: ${issueData.title || args.fromIssue}\n\n## Goals\n${issueData.description || "Complete the linked issue."}\n\n## Checklist\n- [ ] Implement changes\n- [ ] Run tests\n\n## Linked Issue\n- ${args.fromIssue}: ${issueData.title || "Issue"}\n\n## Notes\n(Update with progress)\n`;
					fs.writeFileSync(fullPath, issueContent, "utf-8");
					ctx.ui.notify(`Linked to issue ${args.fromIssue}`, "info");
				}
			}
			const state: LoopState = {
				name: loopName, taskFile, iteration: 1, maxIterations: args.maxIterations,
				itemsPerIteration: args.itemsPerIteration, reflectEvery: args.reflectEvery,
				reflectInstructions: args.reflectInstructions, status: "active",
				startedAt: existing?.startedAt || new Date().toISOString(), lastReflectionAt: 0,
				linkedIssueId, gitnexusSymbols: [],
			};
			saveState(cwd, state);
			currentLoop = loopName;
			updateUI(ctx);
			const content = tryRead(fullPath);
			if (!content) { ctx.ui.notify(`Could not read task file: ${taskFile}`, "error"); return; }
			pi.sendUserMessage(buildPrompt(state, content, false));
		},

		stop(_rest, ctx) {
			const cwd = getCwd(ctx);
			if (!currentLoop) {
				const active = listLoops(cwd).find((l) => l.status === "active");
				if (active) pauseLoop(ctx, active, `Paused Ralph loop: ${active.name}`);
				else ctx.ui.notify("No active Ralph loop", "warning");
				return;
			}
			const state = loadState(cwd, currentLoop);
			if (state) pauseLoop(ctx, state, `Paused Ralph loop: ${currentLoop}`);
		},

		resume(rest, ctx) {
			const cwd = getCwd(ctx);
			const loopName = rest.trim();
			if (!loopName) { ctx.ui.notify("Usage: /ralph resume <name>", "warning"); return; }
			const state = loadState(cwd, loopName);
			if (!state) { ctx.ui.notify(`Loop "${loopName}" not found`, "error"); return; }
			if (state.status === "completed") { ctx.ui.notify(`Loop "${loopName}" is completed`, "warning"); return; }
			if (currentLoop && currentLoop !== loopName) {
				const curr = loadState(cwd, currentLoop);
				if (curr) pauseLoop(ctx, curr);
			}
			state.status = "active";
			state.iteration++;
			saveState(cwd, state);
			currentLoop = loopName;
			updateUI(ctx);
			ctx.ui.notify(`Resumed: ${loopName} (iteration ${state.iteration})`, "info");
			const content = tryRead(require("path").resolve(cwd, state.taskFile));
			if (!content) { ctx.ui.notify(`Could not read task file`, "error"); return; }
			const needsReflection = state.reflectEvery > 0 && (state.iteration - 1) % state.reflectEvery === 0;
			pi.sendUserMessage(buildPrompt(state, content, needsReflection));
		},

		status(_rest, ctx) {
			const cwd = getCwd(ctx);
			const loops = listLoops(cwd);
			if (loops.length === 0) { ctx.ui.notify("No Ralph loops found", "info"); return; }
			ctx.ui.notify(`Ralph loops:\n${loops.map(formatLoop).join("\n")}`, "info");
		},

		cancel(rest, ctx) {
			const cwd = getCwd(ctx);
			const loopName = rest.trim();
			if (!loopName) { ctx.ui.notify("Usage: /ralph cancel <name>", "warning"); return; }
			if (!loadState(cwd, loopName)) { ctx.ui.notify(`Loop "${loopName}" not found`, "error"); return; }
			if (currentLoop === loopName) currentLoop = null;
			tryDelete(getPath(cwd, loopName, ".state.json"));
			ctx.ui.notify(`Cancelled: ${loopName}`, "info");
			updateUI(ctx);
		},

		link(rest, ctx) {
			const cwd = getCwd(ctx);
			const [loopName, issueId] = rest.trim().split(/\s+/);
			if (!loopName || !issueId) { ctx.ui.notify("Usage: /ralph link <name> <issue-id>", "warning"); return; }
			const state = loadState(cwd, loopName);
			if (!state) { ctx.ui.notify(`Loop "${loopName}" not found`, "error"); return; }
			state.linkedIssueId = issueId;
			saveState(cwd, state);
			ctx.ui.notify(`Linked loop "${loopName}" to issue ${issueId}`, "info");
			updateUI(ctx);
		},

		list(rest, ctx) {
			const cwd = getCwd(ctx);
			const archived = rest.trim() === "--archived";
			const loops = listLoops(cwd, archived);
			if (loops.length === 0) { ctx.ui.notify(archived ? "No archived loops" : "No loops found", "info"); return; }
			ctx.ui.notify(`${archived ? "Archived" : "Ralph"} loops:\n${loops.map(formatLoop).join("\n")}`, "info");
		},

		clean(rest, ctx) {
			const cwd = getCwd(ctx);
			const completed = listLoops(cwd).filter((l) => l.status === "completed");
			if (completed.length === 0) { ctx.ui.notify("No completed loops to clean", "info"); return; }
			for (const loop of completed) {
				tryDelete(getPath(cwd, loop.name, ".state.json"));
				if (currentLoop === loop.name) currentLoop = null;
			}
			ctx.ui.notify(`Cleaned ${completed.length} loop(s)`, "info");
			updateUI(ctx);
		},
	};

	const HELP = `Ralph Wiggum - Long-running development loops

Commands:
  /ralph start <name> [options]       Start a new loop
  /ralph start <name> --from-issue <id>  Start from bd issue
  /ralph stop                         Pause current loop
  /ralph resume <name>                Resume a paused loop
  /ralph status                       Show all loops
  /ralph link <name> <issue-id>       Link loop to bd issue
  /ralph cancel <name>                Delete loop
  /ralph-stop                         Stop active loop (idle only)

Options:
  --from-issue <id>         Link to bd issue
  --items-per-iteration N   Suggest N items per turn
  --reflect-every N         Reflect every N iterations
  --max-iterations N        Stop after N iterations (default 50)`;

	pi.registerCommand("ralph", {
		description: "Ralph Wiggum - long-running development loops",
		handler: async (args, ctx) => {
			const [cmd] = args.trim().split(/\s+/);
			const handler = commands[cmd];
			if (handler) handler(args.slice(cmd.length).trim(), ctx);
			else ctx.ui.notify(HELP, "info");
		},
	});

	pi.registerCommand("ralph-stop", {
		description: "Stop active Ralph loop (idle only)",
		handler: async (_args, ctx) => {
			const cwd = getCwd(ctx);
			if (!ctx.isIdle()) { ctx.ui.notify("Agent busy. Press ESC, then /ralph-stop", "warning"); return; }
			let state = currentLoop ? loadState(cwd, currentLoop) : null;
			if (!state) state = listLoops(cwd).find((l) => l.status === "active") || null;
			if (!state) { ctx.ui.notify("No active Ralph loop", "warning"); return; }
			if (state.status !== "active") { ctx.ui.notify(`Loop "${state.name}" not active`, "warning"); return; }
			if (state.linkedIssueId) await bdClose(state.linkedIssueId, "Completed via Ralph loop", cwd);
			stopLoop(ctx, state, `Stopped Ralph loop: ${state.name}`);
		},
	});

	pi.registerTool({
		name: "ralph_start",
		label: "Start Ralph Loop",
		description: "Start a long-running development loop for multi-iteration tasks.",
		parameters: Type.Object({
			name: Type.String({ description: "Loop name" }),
			taskContent: Type.String({ description: "Task markdown with goals/checklist" }),
			itemsPerIteration: Type.Optional(Type.Number({ description: "Items per turn" })),
			reflectEvery: Type.Optional(Type.Number({ description: "Reflect every N iterations" })),
			maxIterations: Type.Optional(Type.Number({ description: "Max iterations (default 50)" })),
			linkedIssueId: Type.Optional(Type.String({ description: "bd issue ID" })),
		}),
		async execute(_id, params, _sig, _upd, ctx) {
			const cwd = getCwd(ctx);
			const loopName = sanitize(params.name);
			const taskFile = require("path").join(RALPH_DIR, `${loopName}.md`);
			if (loadState(cwd, loopName)?.status === "active") {
				return { content: [{ type: "text", text: `Loop "${loopName}" already active.` }], details: {} };
			}
			const fullPath = require("path").resolve(cwd, taskFile);
			ensureDir(fullPath);
			require("fs").writeFileSync(fullPath, params.taskContent, "utf-8");
			const state: LoopState = {
				name: loopName, taskFile, iteration: 1, maxIterations: params.maxIterations ?? 50,
				itemsPerIteration: params.itemsPerIteration ?? 0, reflectEvery: params.reflectEvery ?? 0,
				reflectInstructions: DEFAULT_REFLECT_INSTRUCTIONS, status: "active",
				startedAt: new Date().toISOString(), lastReflectionAt: 0,
				linkedIssueId: params.linkedIssueId, gitnexusSymbols: [],
			};
			saveState(cwd, state);
			currentLoop = loopName;
			updateUI(ctx);
			pi.sendUserMessage(buildPrompt(state, params.taskContent, false), { deliverAs: "followUp" });
			return { content: [{ type: "text", text: `Started loop "${loopName}"` }], details: {} };
		},
	});

	pi.registerTool({
		name: "ralph_done",
		label: "Ralph Iteration Done",
		description: "Complete this iteration and queue the next.",
		parameters: Type.Object({}),
		async execute(_id, _params, _sig, _upd, ctx) {
			const cwd = getCwd(ctx);
			if (!currentLoop) return { content: [{ type: "text", text: "No active loop." }], details: {} };
			const state = loadState(cwd, currentLoop);
			if (!state || state.status !== "active") return { content: [{ type: "text", text: "Loop not active." }], details: {} };
			if (ctx.hasPendingMessages()) return { content: [{ type: "text", text: "Pending messages. Skipping." }], details: {} };
			state.iteration++;
			if (state.maxIterations > 0 && state.iteration > state.maxIterations) {
				completeLoop(ctx, state, `RALPH STOPPED: Max iterations reached`);
				return { content: [{ type: "text", text: "Max iterations reached." }], details: {} };
			}
			const needsReflection = state.reflectEvery > 0 && (state.iteration - 1) % state.reflectEvery === 0;
			saveState(cwd, state);
			updateUI(ctx);
			const content = tryRead(require("path").resolve(cwd, state.taskFile));
			if (!content) { pauseLoop(ctx, state); return { content: [{ type: "text", text: "Error reading task file" }], details: {} }; }
			pi.sendUserMessage(buildPrompt(state, content, needsReflection), { deliverAs: "followUp" });
			return { content: [{ type: "text", text: `Iteration ${state.iteration - 1} done.` }], details: {} };
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!currentLoop) return;
		const state = loadState(getCwd(ctx), currentLoop);
		if (!state || state.status !== "active") return;
		const iterStr = `${state.iteration}${state.maxIterations > 0 ? `/${state.maxIterations}` : ""}`;
		let instr = `Ralph loop on: ${state.taskFile}\n- Update task file as you progress\n- When COMPLETE: ${COMPLETE_MARKER}\n- Otherwise call ralph_done`;
		if (state.linkedIssueId) instr += `\n- On completion: bd close ${state.linkedIssueId}`;
		return { systemPrompt: event.systemPrompt + `\n[RALPH - ${state.name} - Iter ${iterStr}]\n${instr}` };
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!currentLoop) return;
		const cwd = getCwd(ctx);
		const state = loadState(cwd, currentLoop);
		if (!state || state.status !== "active") return;
		const lastAssistant = [...event.messages].reverse().find((m) => m.role === "assistant");
		const text = lastAssistant && Array.isArray(lastAssistant.content)
			? lastAssistant.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map(c => c.text).join("\n")
			: "";
		if (text.includes(COMPLETE_MARKER)) {
			if (state.linkedIssueId) await bdClose(state.linkedIssueId, "Completed via Ralph loop", cwd);
			completeLoop(ctx, state, `RALPH COMPLETE: ${state.name} (${state.iteration} iterations)`);
		} else if (state.maxIterations > 0 && state.iteration >= state.maxIterations) {
			completeLoop(ctx, state, `RALPH STOPPED: Max iterations (${state.maxIterations})`);
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		const active = listLoops(getCwd(ctx)).filter((l) => l.status === "active");
		if (active.length > 0 && ctx.hasUI) {
			ctx.ui.notify(`Active Ralph loops:\n${active.map(l => `  • ${l.name}`).join("\n")}\n\n/ralph resume <name>`, "info");
		}
		updateUI(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (currentLoop) {
			const state = loadState(getCwd(ctx), currentLoop);
			if (state) saveState(getCwd(ctx), state);
		}
	});
}
