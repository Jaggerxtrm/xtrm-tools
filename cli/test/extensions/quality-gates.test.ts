import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExtensionHarness } from "./extension-harness";
import qualityGatesExtension from "../../../packages/pi-extensions/extensions/quality-gates/index";
import { SubprocessRunner } from "../../../packages/pi-extensions/src/core/lib";
import * as fs from "node:fs";

vi.mock("../../../packages/pi-extensions/src/core/lib", async () => {
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

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
}));

describe.skip("Quality Gates Extension (API mismatch - see xtrm-p3gk)", () => {
	let harness: ExtensionHarness;

	beforeEach(() => {
		vi.resetAllMocks();
		harness = new ExtensionHarness();
		(fs.existsSync as any).mockReturnValue(true);
	});

	it("should run quality check for .ts files", async () => {
		(SubprocessRunner.run as any).mockResolvedValue({
			code: 0,
			stdout: "Passed",
			stderr: "ESLint auto-fixed issues",
		});

		qualityGatesExtension(harness.pi);

		const result = await harness.emit("tool_result", {
			toolName: "write",
			input: { path: "src/main.ts" },
			content: [{ type: "text", text: "Original content" }],
		});

		expect(SubprocessRunner.run).toHaveBeenCalledWith(
			"node",
			expect.arrayContaining([expect.stringContaining("quality-check.cjs")]),
			expect.any(Object)
		);
		expect(result.content[1].text).toContain("ESLint auto-fixed issues");
	});

	it("should fail tool result when quality check returns status 2", async () => {
		(SubprocessRunner.run as any).mockResolvedValue({
			code: 2,
			stdout: "",
			stderr: "Compilation failed: error TS1234",
		});

		qualityGatesExtension(harness.pi);

		const result = await harness.emit("tool_result", {
			toolName: "write",
			input: { path: "src/main.ts" },
			content: [{ type: "text", text: "Original content" }],
		});

		expect(result.isError).toBe(true);
		expect(result.content[1].text).toContain("Compilation failed");
	});
});
