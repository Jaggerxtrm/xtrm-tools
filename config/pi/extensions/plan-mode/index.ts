/**
 * Plan Mode Extension - Beads-Integrated
 *
 * Read-only exploration mode that creates bd issues from plans.
 *
 * Features:
 * - /plan command or Ctrl+Alt+P to toggle
 * - Bash restricted to allowlisted read-only commands
 * - Extracts numbered plan steps from "Plan:" sections
 * - Auto-creates epic + bd issues from plan
 * - Integrates test-planning for coverage
 * - Execution via bd ready/claim/close workflow
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { 
	extractPlanSteps, 
	extractTodoItems, 
	isSafeCommand, 
	markCompletedSteps, 
	deriveEpicTitle,
	generateIssueDescription,
	type TodoItem 
} from "./utils.js";
import { 
	bdCreateEpic, 
	bdCreateIssue, 
	bdReady, 
	bdShow, 
	bdClaim, 
	bdChildren,
	bdList,
	isBeadsProject 
} from "./beads.js";
import { batchByLayer, generateTestIssueTitle, generateTestIssueDescription } from "./test-planning.js";
import type { PlanStep, PlanModeState, IssueRef, BdIssue } from "./types.js";

// Tools for plan mode
const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];

// Type guard for assistant messages
function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

// Extract text content from an assistant message
function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

// State
let state: PlanModeState = {
	enabled: false,
	executing: false,
	issues: []
};

// Cached plan steps before epic creation
let pendingPlanSteps: PlanStep[] = [];
let pendingUserPrompt = "";

export default function planModeExtension(pi: ExtensionAPI): void {
	const getCwd = (ctx: ExtensionContext) => ctx.cwd || process.cwd();

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		// Execution phase - show bd issues
		if (state.executing && state.issues.length > 0) {
			const completed = state.issues.filter(i => i.status === "closed").length;
			const current = state.issues.find(i => i.id === state.currentIssueId);
			const status = current 
				? `📋 ${current.id}: ${completed}/${state.issues.length}`
				: `📋 ${completed}/${state.issues.length}`;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", status));
		} else if (state.enabled) {
			// Planning phase - show plan indicator
			const stepCount = pendingPlanSteps.length;
			const status = stepCount > 0 
				? `⏸ plan (${stepCount} steps)`
				: "⏸ plan";
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", status));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		// Widget - execution phase
		if (state.executing && state.issues.length > 0) {
			const lines = state.issues.map((issue) => {
				const isCurrent = issue.id === state.currentIssueId;
				const prefix = issue.status === "closed" 
					? ctx.ui.theme.fg("success", "☑ ")
					: isCurrent 
						? ctx.ui.theme.fg("accent", "→ ")
						: ctx.ui.theme.fg("muted", "☐ ");
				const text = issue.status === "closed"
					? ctx.ui.theme.strikethrough(issue.title)
					: issue.title;
				return prefix + (issue.status === "closed" ? ctx.ui.theme.fg("muted", text) : text);
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else if (state.enabled && pendingPlanSteps.length > 0) {
			// Widget - planning phase with pending steps
			const lines = [
				ctx.ui.theme.fg("warning", ctx.ui.theme.bold("Plan Mode")),
				ctx.ui.theme.fg("muted", `${pendingPlanSteps.length} steps extracted`),
				"",
			];
			pendingPlanSteps.slice(0, 5).forEach((s, i) => {
				lines.push(ctx.ui.theme.fg("dim", `${i + 1}. ${s.text}`));
			});
			if (pendingPlanSteps.length > 5) {
				lines.push(ctx.ui.theme.fg("dim", `... +${pendingPlanSteps.length - 5} more`));
			}
			lines.push("");
			lines.push(ctx.ui.theme.fg("muted", "Create plan, then approve epic"));
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	async function persistState(): Promise<void> {
		pi.appendEntry("plan-mode-v2", state);
	}

	async function persistPendingSteps(): Promise<void> {
		pi.appendEntry("plan-mode-pending", {
			steps: pendingPlanSteps,
			userPrompt: pendingUserPrompt,
			timestamp: Date.now()
		});
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		state.enabled = !state.enabled;
		state.executing = false;
		state.issues = [];
		state.epic = undefined;
		state.currentIssueId = undefined;
		pendingPlanSteps = [];

		if (state.enabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
			ctx.ui.notify("Plan mode enabled. Create a plan, then approve epic creation.", "info");
		} else {
			pi.setActiveTools(["read", "bash", "edit", "write"]);
			ctx.ui.notify("Plan mode disabled. Full access restored.", "info");
		}
		updateStatus(ctx);
	}

	// Commands
	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerCommand("plan-status", {
		description: "Show current epic/issue status",
		handler: async (_args, ctx) => {
			if (!state.epic) {
				ctx.ui.notify("No active epic. Create one from a plan.", "info");
				return;
			}
			const children = await bdChildren(state.epic.epicId, getCwd(ctx));
			const statusLines = children.map(c => `${c.id}: ${c.status} - ${c.title}`);
			ctx.ui.notify(`Epic ${state.epic.epicId}:\n${statusLines.join("\n")}`, "info");
		},
	});

	pi.registerCommand("next", {
		description: "Claim next ready issue from current epic",
		handler: async (_args, ctx) => {
			const cwd = getCwd(ctx);
			if (!state.epic) {
				ctx.ui.notify("No active epic. Use /plan first.", "warning");
				return;
			}

			const ready = await bdReady(cwd);
			const epicChildren = await bdChildren(state.epic.epicId, cwd);
			const readyFromEpic = ready.filter(r => 
				epicChildren.some(c => c.id === r.id && c.status !== "closed")
			);

			if (readyFromEpic.length === 0) {
				ctx.ui.notify("All issues complete or blocked!", "success");
				state.executing = false;
				updateStatus(ctx);
				return;
			}

			const next = readyFromEpic[0];
			const claimed = await bdClaim(next.id, cwd);
			if (claimed) {
				state.currentIssueId = next.id;
				const issueRef = state.issues.find(i => i.id === next.id);
				if (issueRef) issueRef.status = "in_progress";
				
				pi.sendMessage({
					customType: "plan-next-issue",
					content: `[NEXT ISSUE: ${next.id}]\n\n${next.title}\n\nWorkflow:\n1. gitnexus_impact before editing\n2. Implement\n3. bd close ${next.id} --reason "Done"\n4. /next for next issue`,
					display: true
				}, { triggerTurn: true });
			}
			updateStatus(ctx);
			await persistState();
		},
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	// Block destructive bash commands in plan mode
	pi.on("tool_call", async (event) => {
		if (!state.enabled || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `Plan mode: command blocked. Use /plan to disable.\nCommand: ${command}`,
			};
		}
	});

	// Filter out stale plan mode context
	pi.on("context", async (event) => {
		if (state.enabled) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType?.startsWith("plan-")) return false;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[PLAN MODE ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c) => c.type === "text" && (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
					);
				}
				return true;
			}),
		};
	});

	// Inject plan/execution context
	pi.on("before_agent_start", async (event) => {
		// Store user prompt for epic title derivation
		if (event.prompt) {
			pendingUserPrompt = event.prompt;
		}

		if (state.enabled) {
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE - Beads Workflow]

You are in plan mode. Your goal is to create a plan that will become bd issues.

Your workflow:
1. Explore codebase using GitNexus (gitnexus_query, gitnexus_context, gitnexus_impact)
2. Run impact analysis for any proposed changes
3. Create a numbered plan under "Plan:" header
4. Plan will auto-create: epic → issues → test issues

GitNexus Tools:
- gitnexus_query({query: "concept"}) → Find related execution flows
- gitnexus_context({name: "symbol"}) → Understand dependencies  
- gitnexus_impact({target: "symbol", direction: "upstream"}) → Blast radius

Plan Format:
Plan:
1. First step description
2. Second step description
...

Do NOT make changes - just plan. After planning, you will approve epic creation.`,
					display: false,
				},
			};
		}

		if (state.executing && state.currentIssueId) {
			const current = state.issues.find(i => i.id === state.currentIssueId);
			if (current) {
				return {
					message: {
						customType: "plan-execution-context",
						content: `[EXECUTING ISSUE ${state.currentIssueId}]

Current: ${current.title}
Type: ${current.type} | Layer: ${current.layer}

Workflow:
1. gitnexus_impact({target: "<symbol>"}) before editing
2. Implement changes
3. gitnexus_detect_changes() before close
4. bd close ${state.currentIssueId} --reason "Done"
5. /next for next issue

GitNexus symbols: ${state.epic?.gitnexusSymbols[current.step]?.join(", ") || "check code"}`,
						display: false,
					},
				};
			}
		}
	});

	// Handle plan completion - prompt for epic creation
	pi.on("agent_end", async (event, ctx) => {
		const cwd = getCwd(ctx);

		// Check if all issues are closed
		if (state.executing && state.issues.length > 0) {
			const allClosed = state.issues.every(i => i.status === "closed");
			if (allClosed) {
				pi.sendMessage({
					customType: "plan-complete",
					content: `**Plan Complete!** ✓\n\nEpic ${state.epic?.epicId} finished.\nAll ${state.issues.length} issues closed.`,
					display: true
				}, { triggerTurn: false });
				state.executing = false;
				state.issues = [];
				state.epic = undefined;
				state.currentIssueId = undefined;
				updateStatus(ctx);
				await persistState();
			}
			return;
		}

		if (!state.enabled || !ctx.hasUI) return;

		// Check if this is a beads project
		if (!(isBeadsProject(cwd))) {
			ctx.ui.notify("Not a beads project. bd commands not available.", "warning");
			return;
		}

		// Extract plan from last assistant message
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const planSteps = extractPlanSteps(getTextContent(lastAssistant));
			if (planSteps.length > 0) {
				pendingPlanSteps = planSteps;
				await persistPendingSteps();
			}
		}

		// Show plan and prompt for approval
		if (pendingPlanSteps.length > 0) {
			const todoListText = pendingPlanSteps.map((s, i) => 
				`${i + 1}. ☐ ${s.text} [${s.type}/${s.layer}]`
			).join("\n");
			
			pi.sendMessage({
				customType: "plan-todo-list",
				content: `**Plan Steps (${pendingPlanSteps.length}):**\n\n${todoListText}`,
				display: true
			}, { triggerTurn: false });

			const epicTitle = deriveEpicTitle(pendingUserPrompt, pendingPlanSteps);
			const choice = await ctx.ui.select("Create epic + issues from this plan?", [
				`Yes, create "${epicTitle.slice(0, 50)}..."`,
				"Refine plan",
				"Cancel"
			]);

			if (choice?.startsWith("Yes")) {
				await createEpicAndIssues(ctx, epicTitle);
			} else if (choice === "Refine plan") {
				const refinement = await ctx.ui.editor("Refine the plan:", "");
				if (refinement?.trim()) {
					pi.sendUserMessage(refinement.trim());
				}
			}
		}
	});

	// Create epic and issues
	async function createEpicAndIssues(ctx: ExtensionContext, epicTitle: string): Promise<void> {
		const cwd = getCwd(ctx);

		// Create epic
		const epic = await bdCreateEpic(epicTitle, 1, cwd);
		if (!epic) {
			ctx.ui.notify("Failed to create epic", "error");
			return;
		}

		ctx.ui.notify(`Created epic ${epic.id}`, "success");

		const issueIds = new Map<number, string>();

		// Create implementation issues
		for (const step of pendingPlanSteps) {
			const description = generateIssueDescription(step, epic.id, []);
			const issue = await bdCreateIssue(
				step.text,
				step.type,
				step.priority,
				epic.id,
				cwd,
				description
			);

			if (issue) {
				issueIds.set(step.step, issue.id);
				state.issues.push({
					id: issue.id,
					step: step.step,
					title: step.text,
					status: "open",
					type: step.type,
					layer: step.layer
				});
				ctx.ui.notify(`Created issue ${issue.id}`, "info");
			}
		}

		// Create test issues (batched by layer)
		const layerBatches = batchByLayer(pendingPlanSteps.filter(s => s.layer !== "unknown"));
		for (const [layer, steps] of layerBatches) {
			if (steps.length === 0) continue;
			
			const testTitle = generateTestIssueTitle(layer, steps);
			const testDesc = generateTestIssueDescription(layer, steps, issueIds);
			
			const testIssue = await bdCreateIssue(
				testTitle,
				"task",
				2,
				epic.id,
				cwd,
				testDesc
			);

			if (testIssue) {
				ctx.ui.notify(`Created test issue ${testIssue.id} for ${layer} layer`, "info");
			}
		}

		// Store epic state
		state.epic = {
			epicId: epic.id,
			epicTitle,
			issueIds: Array.from(issueIds.values()),
			stepMapping: Object.fromEntries(issueIds),
			gitnexusSymbols: {},
			createdAt: Date.now()
		};

		// Prompt to start execution
		const startNow = await ctx.ui.select("Epic created. Start execution?", ["Yes, claim first issue", "Later"]);
		
		if (startNow === "Yes, claim first issue") {
			state.enabled = false;
			state.executing = true;
			pi.setActiveTools(["read", "bash", "edit", "write"]);
			
			// Claim first issue
			const firstIssueId = issueIds.get(1);
			if (firstIssueId) {
				const claimed = await bdClaim(firstIssueId, cwd);
				if (claimed) {
					state.currentIssueId = firstIssueId;
					const first = state.issues.find(i => i.id === firstIssueId);
					if (first) first.status = "in_progress";
					
					pi.sendMessage({
						customType: "plan-start-execution",
						content: `[START EXECUTION]\n\nEpic: ${epicTitle}\nFirst issue: ${firstIssueId}\n\nWorkflow:\n1. gitnexus_impact before editing\n2. Implement\n3. bd close ${firstIssueId} --reason "Done"\n4. /next for next issue`,
						display: true
					}, { triggerTurn: true });
				}
			}
		}

		pendingPlanSteps = [];
		pendingUserPrompt = "";
		await persistPendingSteps();
		updateStatus(ctx);
		await persistState();
	}

	// Sync issue status on bd close
	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		const command = event.input.command as string;
		if (!command?.includes("bd close")) return;

		const match = command.match(/bd\s+close\s+(\S+)/);
		if (!match) return;

		const closedId = match[1];
		const issue = state.issues.find(i => i.id === closedId);
		if (issue) {
			issue.status = "closed";
			state.currentIssueId = undefined;
			updateStatus(ctx);
			await persistState();
		}
	});

	// Restore state on session start
	// Persist state before session switch
	pi.on("session_before_switch", async (_event, ctx) => {
		// Persist current state before switching
		if (state.enabled || state.executing) {
			await persistState();
			await persistPendingSteps();
		}
		// Clear module-level cache for next session
		state = {
			enabled: false,
			executing: false,
			issues: []
		};
		pendingPlanSteps = [];
		pendingUserPrompt = "";
	});

	pi.on("session_start", async (_event, ctx) => {
		// Reset module-level state first
		state = {
			enabled: false,
			executing: false,
			issues: []
		};
		pendingPlanSteps = [];
		pendingUserPrompt = "";

		if (pi.getFlag("plan") === true) {
			state.enabled = true;
		}

		const entries = ctx.sessionManager.getEntries();

		// Restore pending plan steps
		const pendingEntry = entries
			.filter((e: any) => e.type === "custom" && e.customType === "plan-mode-pending")
			.pop() as { data?: { steps?: any[]; userPrompt?: string } } | undefined;

		if (pendingEntry?.data) {
			pendingPlanSteps = pendingEntry.data.steps || [];
			pendingUserPrompt = pendingEntry.data.userPrompt || "";
		}
		const planModeEntry = entries
			.filter((e: any) => e.type === "custom" && e.customType === "plan-mode-v2")
			.pop() as { data?: PlanModeState } | undefined;

		if (planModeEntry?.data) {
			state = { ...state, ...planModeEntry.data };
			
			// Sync with bd
			if (state.executing && state.epic) {
				const children = await bdChildren(state.epic.epicId, getCwd(ctx));
				for (const child of children) {
					const issue = state.issues.find(i => i.id === child.id);
					if (issue) issue.status = child.status;
				}
			}
		}

		if (state.enabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
		}
		updateStatus(ctx);
	});
}
