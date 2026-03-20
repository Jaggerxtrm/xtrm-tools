import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

function getTextContent(result: any): string {
	if (!result?.content || !Array.isArray(result.content)) return "";
	return result.content
		.filter((c: any) => c?.type === "text" && typeof c.text === "string")
		.map((c: any) => c.text)
		.join("\n")
		.trim();
}

function oneLine(s: string): string {
	return (s || "").replace(/\s+/g, " ").trim();
}

const toolCache = new Map<string, ReturnType<typeof createBuiltInTools>>();
function createBuiltInTools(cwd: string) {
	return {
		read: createReadTool(cwd),
		bash: createBashTool(cwd),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
		find: createFindTool(cwd),
		grep: createGrepTool(cwd),
		ls: createLsTool(cwd),
	};
}
function getBuiltInTools(cwd: string) {
	let tools = toolCache.get(cwd);
	if (!tools) {
		tools = createBuiltInTools(cwd);
		toolCache.set(cwd, tools);
	}
	return tools;
}

export default function (pi: ExtensionAPI) {
	let minimalEnabled = true;
	let thinkingStatusEnabled = true;
	let spinnerTimer: NodeJS.Timeout | null = null;
	let spinnerIndex = 0;
	const frames = ["thinking   ", "thinking.  ", "thinking.. ", "thinking..."];

	const clearSpinner = (ctx: any) => {
		if (spinnerTimer) {
			clearInterval(spinnerTimer);
			spinnerTimer = null;
		}
		if (ctx?.hasUI) ctx.ui.setStatus("thinking", undefined);
	};

	const startSpinner = (ctx: any) => {
		if (!thinkingStatusEnabled || !ctx?.hasUI) return;
		clearSpinner(ctx);
		spinnerIndex = 0;
		ctx.ui.setStatus("thinking", frames[spinnerIndex]);
		spinnerTimer = setInterval(() => {
			spinnerIndex = (spinnerIndex + 1) % frames.length;
			ctx.ui.setStatus("thinking", frames[spinnerIndex]);
		}, 220);
	};

	const renderCollapsedResult = (result: any, theme: any) => {
		if (minimalEnabled) return new Text("", 0, 0);
		const text = oneLine(getTextContent(result));
		if (!text) return new Text("", 0, 0);
		return new Text(theme.fg("muted", ` → ${text.slice(0, 120)}`), 0, 0);
	};

	const renderExpandedResult = (result: any, theme: any) => {
		const text = getTextContent(result);
		if (!text) return new Text("", 0, 0);
		const output = text.split("\n").map((line) => theme.fg("toolOutput", line)).join("\n");
		return new Text(`\n${output}`, 0, 0);
	};

	pi.registerTool({
		name: "bash",
		label: "bash",
		description: getBuiltInTools(process.cwd()).bash.description,
		parameters: getBuiltInTools(process.cwd()).bash.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).bash.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args, theme) {
			const cmd = oneLine(args.command || "");
			return new Text(`${theme.fg("toolTitle", theme.bold("bash"))} ${theme.fg("accent", cmd || "...")}`, 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			return expanded ? renderExpandedResult(result, theme) : renderCollapsedResult(result, theme);
		},
	});

	for (const name of ["read", "write", "edit", "find", "grep", "ls"] as const) {
		pi.registerTool({
			name,
			label: name,
			description: (getBuiltInTools(process.cwd()) as any)[name].description,
			parameters: (getBuiltInTools(process.cwd()) as any)[name].parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				return (getBuiltInTools(ctx.cwd) as any)[name].execute(toolCallId, params, signal, onUpdate);
			},
			renderCall(args, theme) {
				const suffix = oneLine(args.path || args.pattern || "");
				return new Text(`${theme.fg("toolTitle", theme.bold(name))}${suffix ? ` ${theme.fg("accent", suffix)}` : ""}`, 0, 0);
			},
			renderResult(result, { expanded }, theme) {
				return expanded ? renderExpandedResult(result, theme) : renderCollapsedResult(result, theme);
			},
		});
	}

	pi.registerCommand("minimal-on", {
		description: "Enable minimal collapsed tool output",
		handler: async (_args, ctx) => {
			minimalEnabled = true;
			ctx.ui.notify("Minimal mode enabled", "info");
		},
	});

	pi.registerCommand("minimal-off", {
		description: "Disable minimal collapsed tool output",
		handler: async (_args, ctx) => {
			minimalEnabled = false;
			ctx.ui.notify("Minimal mode disabled", "info");
		},
	});

	pi.registerCommand("minimal-toggle", {
		description: "Toggle minimal collapsed tool output",
		handler: async (_args, ctx) => {
			minimalEnabled = !minimalEnabled;
			ctx.ui.notify(`Minimal mode ${minimalEnabled ? "enabled" : "disabled"}`, "info");
		},
	});

	pi.registerCommand("thinking-status-toggle", {
		description: "Toggle flashing thinking status indicator",
		handler: async (_args, ctx) => {
			thinkingStatusEnabled = !thinkingStatusEnabled;
			if (!thinkingStatusEnabled) clearSpinner(ctx);
			ctx.ui.notify(`Thinking status ${thinkingStatusEnabled ? "enabled" : "disabled"}`, "info");
		},
	});

	pi.on("turn_start", async (_event, ctx) => {
		startSpinner(ctx);
		return undefined;
	});

	pi.on("turn_end", async (_event, ctx) => {
		clearSpinner(ctx);
		return undefined;
	});

	pi.on("agent_end", async (_event, ctx) => {
		clearSpinner(ctx);
		return undefined;
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		clearSpinner(ctx);
		return undefined;
	});
}
