import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExtensionHarness } from "./extension-harness";
import mainGuardExtension from "../../extensions/main-guard";
import { SubprocessRunner } from "../../extensions/core/lib";

vi.mock("../../extensions/core/lib", async () => {
	return {
		SubprocessRunner: {
			run: vi.fn(),
		},
		EventAdapter: {
			isMutatingFileTool: vi.fn((event) => event.toolName === "write" || event.toolName === "edit"),
			extractPathFromToolInput: vi.fn((event) => event.input.path),
		},
		Logger: vi.fn().mockImplementation(function() {
			this.debug = vi.fn();
			this.info = vi.fn();
			this.warn = vi.fn();
			this.error = vi.fn();
		}),
	};
});

describe("Main Guard Extension", () => {
	let harness: ExtensionHarness;

	beforeEach(() => {
		vi.resetAllMocks();
		harness = new ExtensionHarness();
	});

	it("should block edits on main branch", async () => {
		(SubprocessRunner.run as any).mockResolvedValue({ code: 0, stdout: "main" });

		mainGuardExtension(harness.pi);

		const result = await harness.emit("tool_call", {
			toolName: "write",
			input: { path: "src/main.ts" },
		});

		expect(result).toEqual({
			block: true,
			reason: expect.stringContaining("On protected branch 'main'"),
		});
	});

	it("should allow edits on feature branches", async () => {
		(SubprocessRunner.run as any).mockResolvedValue({ code: 0, stdout: "feature/abc" });

		mainGuardExtension(harness.pi);

		const result = await harness.emit("tool_call", {
			toolName: "write",
			input: { path: "src/main.ts" },
		});

		expect(result).toBeUndefined();
	});

	it("should block rm -rf with confirmation", async () => {
		(SubprocessRunner.run as any).mockResolvedValue({ code: 0, stdout: "feature/abc" });
		harness.ctx.ui.confirm = vi.fn().mockResolvedValue(false);

		mainGuardExtension(harness.pi);

		const result = await harness.emit("tool_call", {
			toolName: "bash",
			input: { command: "rm -rf /important/stuff" },
		});

		expect(result).toEqual({
			block: true,
			reason: "Blocked by user confirmation",
		});
	});
});
