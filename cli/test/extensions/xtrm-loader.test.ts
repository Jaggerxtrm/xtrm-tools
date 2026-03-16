import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExtensionHarness } from "./extension-harness";
import xtrmLoaderExtension from "../../extensions/xtrm-loader";
import * as fs from "node:fs";

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	readdirSync: vi.fn(),
}));

describe("XTRM Loader Extension", () => {
	let harness: ExtensionHarness;

	beforeEach(() => {
		vi.resetAllMocks();
		harness = new ExtensionHarness();
	});

	it("should load project roadmap and rules", async () => {
		(fs.existsSync as any).mockImplementation((p: string) => {
			if (p.endsWith("ROADMAP.md")) return true;
			if (p.endsWith(".claude/rules")) return true;
			if (p.endsWith(".claude/skills")) return false;
			return false;
		});

		(fs.readFileSync as any).mockImplementation((p: string) => {
			if (p.endsWith("ROADMAP.md")) return "My Roadmap Content";
			if (p.endsWith("rule1.md")) return "Rule 1 Content";
			return "";
		});

		(fs.readdirSync as any).mockImplementation((p: string) => {
			if (p.endsWith(".claude/rules")) return [{ name: "rule1.md", isFile: () => true, isDirectory: () => false }];
			return [];
		});

		xtrmLoaderExtension(harness.pi);

		// Trigger session_start to load data
		await harness.emit("session_start", {});

		// Trigger before_agent_start to see injection
		const result = await harness.emit("before_agent_start", {
			systemPrompt: "Base prompt"
		});

		expect(result.systemPrompt).toContain("My Roadmap Content");
		expect(result.systemPrompt).toContain("Rule 1 Content");
		expect(harness.ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("context and skills indexed"), "info");
	});
});
