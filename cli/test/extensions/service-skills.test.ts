import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExtensionHarness } from "./extension-harness";
import serviceSkillsExtension from "../../extensions/service-skills";
import { SubprocessRunner } from "../../extensions/core/lib";
import * as fs from "node:fs";

vi.mock("../../extensions/core/lib", async () => {
	return {
		SubprocessRunner: {
			run: vi.fn(),
		},
		Logger: vi.fn().mockImplementation(function () {
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

describe("Service Skills Extension", () => {
	let harness: ExtensionHarness;

	beforeEach(() => {
		vi.resetAllMocks();
		harness = new ExtensionHarness("/mock/project");
	});

	it("gracefully no-ops when service-registry.json is absent", async () => {
		(fs.existsSync as any).mockReturnValue(false);

		serviceSkillsExtension(harness.pi);

		const beforeStart = await harness.emit("before_agent_start", {
			systemPrompt: "Base prompt",
		});
		const toolResult = await harness.emit("tool_result", {
			toolName: "write",
			input: { path: "src/file.ts" },
			content: [{ type: "text", text: "ok" }],
		});

		expect(beforeStart).toBeUndefined();
		expect(toolResult).toBeUndefined();
		expect(SubprocessRunner.run).not.toHaveBeenCalled();
	});

	it("injects catalog when registry + cataloger script are present", async () => {
		(fs.existsSync as any).mockImplementation((p: string) => {
			if (p === "/mock/project/service-registry.json") return true;
			if (p.includes(".claude/skills/using-service-skills/scripts/cataloger.py")) return true;
			return false;
		});

		(SubprocessRunner.run as any).mockResolvedValue({
			code: 0,
			stdout: "<project_service_catalog>...</project_service_catalog>",
			stderr: "",
		});

		serviceSkillsExtension(harness.pi);

		const result = await harness.emit("before_agent_start", {
			systemPrompt: "Base prompt",
		});

		expect(SubprocessRunner.run).toHaveBeenCalledWith(
			"python3",
			expect.arrayContaining([expect.stringContaining("cataloger.py")]),
			expect.objectContaining({
				cwd: "/mock/project",
				env: expect.objectContaining({
					CLAUDE_PROJECT_DIR: "/mock/project",
					SERVICE_REGISTRY_PATH: "/mock/project/service-registry.json",
				}),
			}),
		);
		expect(result.systemPrompt).toContain("project_service_catalog");
	});
});
