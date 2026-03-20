import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExtensionHarness } from "./extension-harness";
import beadsExtension from "../../extensions/beads";
import { SubprocessRunner } from "../../extensions/core/lib";
import * as fs from "node:fs";

vi.mock("../../extensions/core/lib", async () => {
	return {
		SubprocessRunner: {
			run: vi.fn(),
		},
		EventAdapter: {
			isMutatingFileTool: vi.fn((event) => event.toolName === "write"),
			isBeadsProject: vi.fn(() => true),
			parseBdCounts: vi.fn((s: string) => {
				const m = s.match(/Total:\s*\d+\s+issues?\s*\((\d+)\s+open,\s*(\d+)\s+in progress\)/);
				if (!m) return null;
				return { open: parseInt(m[1], 10), inProgress: parseInt(m[2], 10) };
			}),
		},
		Logger: vi.fn().mockImplementation(function() {
			this.debug = vi.fn();
			this.info = vi.fn();
			this.warn = vi.fn();
			this.error = vi.fn();
		}),
	};
});

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	unlinkSync: vi.fn(),
}));

describe("Beads Extension", () => {
	let harness: ExtensionHarness;

	beforeEach(() => {
		vi.resetAllMocks();
		harness = new ExtensionHarness();
		harness.pi.sendUserMessage = vi.fn();
		(fs.existsSync as any).mockReturnValue(false);
	});

	it("blocks edits when no claim and trackable work exists", async () => {
		(SubprocessRunner.run as any).mockImplementation(async (_cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "get") return { code: 1, stdout: "", stderr: "" };
			if (args[0] === "list") return { code: 0, stdout: "Total: 5 issues (3 open, 2 in progress)", stderr: "" };
			return { code: 0, stdout: "", stderr: "" };
		});

		beadsExtension(harness.pi);
		const result = await harness.emit("tool_call", { toolName: "write", input: { path: "src/main.ts" } });

		expect(result).toBeDefined();
		expect(result?.block).toBe(true);
		expect(result?.reason).toContain("No active claim for session");
	});

	it("adds claim kv on bd update --claim", async () => {
		const calls: string[][] = [];
		(SubprocessRunner.run as any).mockImplementation(async (_cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "set") calls.push(args);
			return { code: 0, stdout: "", stderr: "" };
		});

		beadsExtension(harness.pi);
		const result = await harness.emit("tool_result", {
			toolName: "bash",
			input: { command: "bd update issue-456 --claim" },
			content: [{ type: "text", text: "ok" }],
			isError: false,
		});

		expect(calls.some((a) => a[2].startsWith("claimed:"))).toBe(true);
		expect(result?.content?.[1]?.text ?? "").toContain("claimed issue");
	});

	it("marks closed-this-session on bd close and appends memory reminder", async () => {
		const calls: string[][] = [];
		(SubprocessRunner.run as any).mockImplementation(async (_cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "set") calls.push(args);
			return { code: 0, stdout: "", stderr: "" };
		});

		beadsExtension(harness.pi);
		const result = await harness.emit("tool_result", {
			toolName: "bash",
			input: { command: "bd close issue-123" },
			content: [{ type: "text", text: "closed" }],
			isError: false,
		});

		expect(calls.some((a) => a[2].startsWith("closed-this-session:"))).toBe(true);
		expect(result?.content?.[1]?.text ?? "").toContain("touch .beads/.memory-gate-done");
	});

	it("agent_end prompts memory gate when closed marker exists and no ack marker", async () => {
		(SubprocessRunner.run as any).mockImplementation(async (_cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "get" && String(args[2]).startsWith("closed-this-session:")) {
				return { code: 0, stdout: "issue-123", stderr: "" };
			}
			return { code: 1, stdout: "", stderr: "" };
		});
		(fs.existsSync as any).mockReturnValue(false);

		beadsExtension(harness.pi);
		await harness.emit("agent_end", {});

		expect(harness.pi.sendUserMessage).toHaveBeenCalledTimes(1);
		expect(String((harness.pi.sendUserMessage as any).mock.calls[0][0])).toContain("Memory gate");
	});

	it("agent_end with ack marker clears claim + closed marker and does not prompt", async () => {
		const calls: string[][] = [];
		(SubprocessRunner.run as any).mockImplementation(async (_cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "clear") calls.push(args);
			if (args[0] === "kv" && args[1] === "get" && String(args[2]).startsWith("closed-this-session:")) {
				return { code: 0, stdout: "issue-123", stderr: "" };
			}
			return { code: 1, stdout: "", stderr: "" };
		});
		(fs.existsSync as any).mockImplementation((p: string) => String(p).endsWith(".beads/.memory-gate-done"));

		beadsExtension(harness.pi);
		await harness.emit("agent_end", {});

		expect(calls.some((a) => String(a[2]).startsWith("claimed:"))).toBe(true);
		expect(calls.some((a) => String(a[2]).startsWith("closed-this-session:"))).toBe(true);
		expect(harness.pi.sendUserMessage).not.toHaveBeenCalled();
	});

	it("blocks mutating tool calls while memory gate is pending", async () => {
		(SubprocessRunner.run as any).mockImplementation(async (_cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "get" && String(args[2]).startsWith("closed-this-session:")) {
				return { code: 0, stdout: "issue-123", stderr: "" };
			}
			return { code: 1, stdout: "", stderr: "" };
		});
		(fs.existsSync as any).mockReturnValue(false);

		beadsExtension(harness.pi);
		const result = await harness.emit("tool_call", { toolName: "write", input: { path: "src/x.ts" } });
		expect(result?.block).toBe(true);
		expect(String(result?.reason ?? "")).toContain("Memory gate pending");
	});

	it("blocks session_before_switch while memory gate is pending", async () => {
		(SubprocessRunner.run as any).mockImplementation(async (_cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "get" && String(args[2]).startsWith("closed-this-session:")) {
				return { code: 0, stdout: "issue-123", stderr: "" };
			}
			return { code: 1, stdout: "", stderr: "" };
		});
		(fs.existsSync as any).mockReturnValue(false);

		beadsExtension(harness.pi);
		const result = await harness.emit("session_before_switch", {});
		expect(result?.cancel).toBe(true);
		expect(String(result?.reason ?? "")).toContain("Memory gate pending");
	});
});
