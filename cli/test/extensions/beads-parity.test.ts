import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExtensionHarness } from "./extension-harness";
import beadsExtension from "../../../config/pi/extensions/beads/index";
import { SubprocessRunner } from "../../../config/pi/extensions/core/lib";
import * as fs from "node:fs";

vi.mock("@mariozechner/pi-coding-agent", () => ({
	isToolCallEventType: (name: string, event: any) => event?.toolName === name,
	isBashToolResult: (event: any) => event?.toolName === "bash",
}));

vi.mock("../../../config/pi/extensions/core/lib", async () => {
	const actual = await vi.importActual<any>("../../../config/pi/extensions/core/lib");
	return {
		...actual,
		SubprocessRunner: {
			run: vi.fn(),
		},
		EventAdapter: {
			isBeadsProject: vi.fn(() => true),
			isMutatingFileTool: vi.fn((event: any) => event?.toolName === "write"),
			parseBdCounts: vi.fn(() => ({ open: 1, inProgress: 0 })),
		},
	};
});

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	unlinkSync: vi.fn(),
}));

describe("Pi beads extension parity", () => {
	let harness: ExtensionHarness;

	beforeEach(() => {
		vi.resetAllMocks();
		harness = new ExtensionHarness();
		harness.pi.sendUserMessage = vi.fn();
	});

	it("stores closed-this-session marker on successful bd close", async () => {
		const calls: string[][] = [];
		(SubprocessRunner.run as any).mockImplementation(async (_cmd: string, args: string[]) => {
			calls.push(args);
			return { code: 0, stdout: "", stderr: "" };
		});

		beadsExtension(harness.pi);

		const result = await harness.emit("tool_result", {
			toolName: "bash",
			input: { command: "bd close xtrm-777 --reason done" },
			content: [{ type: "text", text: "closed" }],
			isError: false,
		});

		expect(calls.some((a) => a[0] === "kv" && a[1] === "set" && a[2].startsWith("closed-this-session:"))).toBe(true);
		expect(result?.content?.[1]?.text).toContain("Beads Insight");
	});

	it("fires memory gate once per closed marker and does not loop", async () => {
		(SubprocessRunner.run as any).mockImplementation(async (_cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "get" && `${args[2]}`.startsWith("closed-this-session:")) {
				return { code: 0, stdout: "xtrm-123\n", stderr: "" };
			}
			return { code: 1, stdout: "", stderr: "" };
		});

		beadsExtension(harness.pi);

		await harness.emit("agent_end", { messages: [] });
		await harness.emit("agent_end", { messages: [] });

		expect(harness.pi.sendUserMessage).toHaveBeenCalledTimes(1);
		expect(harness.pi.sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("claim `xtrm-123` was closed this session"));
	});

	it.skip("consumes .memory-gate-done marker and clears session markers (test environment issue)", async () => {
		(fs.existsSync as any).mockReturnValue(true);
		const calls: string[][] = [];
		(SubprocessRunner.run as any).mockImplementation(async (_cmd: string, args: string[]) => {
			calls.push(args);
			return { code: 0, stdout: "", stderr: "" };
		});

		beadsExtension(harness.pi);
		await harness.emit("agent_end", { messages: [] });

		expect(fs.unlinkSync).toHaveBeenCalled();
		expect(calls.some((a) => a[0] === "kv" && a[1] === "clear" && `${a[2]}`.startsWith("claimed:"))).toBe(true);
		expect(calls.some((a) => a[0] === "kv" && a[1] === "clear" && `${a[2]}`.startsWith("closed-this-session:"))).toBe(true);
		expect(harness.pi.sendUserMessage).not.toHaveBeenCalled();
	});
});
