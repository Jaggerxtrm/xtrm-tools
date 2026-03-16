import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExtensionHarness } from "./extension-harness";
import beadsExtension from "../../extensions/beads";
import { SubprocessRunner } from "../../extensions/core";
import * as fs from "node:fs";

vi.mock("../../extensions/core", async () => {
	return {
		SubprocessRunner: {
			run: vi.fn(),
		},
		EventAdapter: {
			isMutatingFileTool: vi.fn((event) => event.toolName === "write"),
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
}));

describe("Beads Extension", () => {
	let harness: ExtensionHarness;

	beforeEach(() => {
		vi.resetAllMocks();
		harness = new ExtensionHarness();
		(fs.existsSync as any).mockReturnValue(true);
	});

	it("should block edits when claim check fails", async () => {
		(SubprocessRunner.run as any).mockImplementation(async (cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "get") return { code: 1, stdout: "", stderr: "" };
			if (args[0] === "list") {
                return { code: 0, stdout: "Total: 5 issues (3 open, 2 in progress)", stderr: "" };
            }
			return { code: 0, stdout: "", stderr: "" };
		});

		beadsExtension(harness.pi);

		const result = await harness.emit("tool_call", {
			toolName: "write",
			input: { path: "src/main.ts" },
		});

		expect(result).toBeDefined();
        if (result) {
		    expect(result.block).toBe(true);
		    expect(result.reason).toContain("No active issue claim");
        }
	});

	it("should allow edits when an issue is claimed", async () => {
		(SubprocessRunner.run as any).mockImplementation(async (cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "get") return { code: 0, stdout: "issue-123", stderr: "" };
			return { code: 0, stdout: "", stderr: "" };
		});

		beadsExtension(harness.pi);

		const result = await harness.emit("tool_call", {
			toolName: "write",
			input: { path: "src/main.ts" },
		});

		expect(result).toBeUndefined();
	});

	it("should block git commit when an issue is claimed", async () => {
		(SubprocessRunner.run as any).mockImplementation(async (cmd: string, args: string[]) => {
			if (args[0] === "kv" && args[1] === "get") return { code: 0, stdout: "issue-123", stderr: "" };
			if (args[0] === "list") {
                return { code: 0, stdout: "Total: 1 issues (0 open, 1 in progress)\n◐ issue-123 Title", stderr: "" };
            }
			return { code: 0, stdout: "", stderr: "" };
		});

		beadsExtension(harness.pi);

		const result = await harness.emit("tool_call", {
			toolName: "bash",
			input: { command: "git commit -m 'feat: something'" },
		});

		expect(result).toBeDefined();
        if (result) {
		    expect(result.block).toBe(true);
		    expect(result.reason).toContain("Resolve open claim [issue-123]");
        }
	});

	it("should inject memory reminder on bd close", async () => {
		(SubprocessRunner.run as any).mockResolvedValue({ code: 0, stdout: "", stderr: "" });
		
		beadsExtension(harness.pi);

		const result = await harness.emit("tool_result", {
			toolName: "bash",
			input: { command: "bd close issue-123" },
			content: [{ type: "text", text: "Issue closed successfully." }],
			isError: false,
		});

		expect(result.content).toHaveLength(2);
		expect(result.content[1].text).toContain("Beads Insight");
	});
});
