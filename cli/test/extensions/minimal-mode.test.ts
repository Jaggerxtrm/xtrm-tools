import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import minimalModeExtension from "../../extensions/minimal-mode";

vi.mock("@mariozechner/pi-coding-agent", async () => {
	const mk = () => ({
		description: "mock",
		parameters: { type: "object", properties: {} },
		execute: vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })),
	});
	return {
		createReadTool: () => mk(),
		createBashTool: () => mk(),
		createEditTool: () => mk(),
		createWriteTool: () => mk(),
		createFindTool: () => mk(),
		createGrepTool: () => mk(),
		createLsTool: () => mk(),
	};
});

vi.mock("@mariozechner/pi-tui", async () => {
	class Text {
		constructor(public value: string) {}
	}
	return { Text };
});

describe("minimal-mode extension", () => {
	let handlers: Record<string, Function[]>;
	let commands: Record<string, any>;
	let tools: Record<string, any>;
	let ctx: any;
	let pi: any;

	beforeEach(() => {
		vi.useFakeTimers();
		handlers = {};
		commands = {};
		tools = {};
		ctx = {
			cwd: "/mock/project",
			hasUI: true,
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
				setHeader: vi.fn(),
				theme: {
					fg: vi.fn((_color: string, text: string) => text),
					bold: vi.fn((text: string) => text),
				},
			},
		};
		pi = {
			on: (event: string, handler: Function) => {
				if (!handlers[event]) handlers[event] = [];
				handlers[event].push(handler);
			},
			registerTool: (tool: any) => {
				tools[tool.name] = tool;
			},
			registerCommand: (nameOrDef: any, maybeDef?: any) => {
				if (typeof nameOrDef === "string") commands[nameOrDef] = maybeDef;
				else commands[nameOrDef.name] = nameOrDef;
			},
		};
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const emit = async (event: string, data: any = {}) => {
		for (const h of handlers[event] || []) await h(data, ctx);
	};

	it("registers minimal/thinking commands and tool overrides", () => {
		minimalModeExtension(pi);

		expect(commands["minimal-on"]).toBeDefined();
		expect(commands["minimal-off"]).toBeDefined();
		expect(commands["minimal-toggle"]).toBeDefined();
		expect(commands["thinking-status-toggle"]).toBeDefined();

		expect(tools["bash"]).toBeDefined();
		expect(tools["read"]).toBeDefined();
		expect(tools["write"]).toBeDefined();
		expect(tools["edit"]).toBeDefined();
		expect(tools["find"]).toBeDefined();
		expect(tools["grep"]).toBeDefined();
		expect(tools["ls"]).toBeDefined();
	});

	it("starts and clears thinking status/header across turn lifecycle", async () => {
		minimalModeExtension(pi);

		await emit("turn_start", {});
		expect(ctx.ui.setStatus).toHaveBeenCalledWith("thinking", "thinking   ");
		expect(ctx.ui.setHeader).toHaveBeenCalled();

		vi.advanceTimersByTime(240);
		expect(ctx.ui.setStatus).toHaveBeenCalledWith("thinking", "thinking.  ");

		await emit("turn_end", {});
		expect(ctx.ui.setStatus).toHaveBeenCalledWith("thinking", undefined);
		expect(ctx.ui.setHeader).toHaveBeenCalledWith(undefined);
	});
});
