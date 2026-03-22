import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExtensionHarness } from "./extension-harness";
import xtrmLoaderExtension from "../../../config/pi/extensions/xtrm-loader/index";
import * as fs from "node:fs";

vi.mock("node:os", () => ({
	homedir: () => "/home/test",
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	readdirSync: vi.fn(),
	promises: {
		readFile: vi.fn(),
	},
}));

describe("XTRM Loader Extension", () => {
	let harness: ExtensionHarness;

	beforeEach(() => {
		vi.resetAllMocks();
		harness = new ExtensionHarness("/workspace/project");
		(fs.readdirSync as any).mockReturnValue([]);
	});

	it("injects using-xtrm content into system prompt at before_agent_start", async () => {
		(fs.existsSync as any).mockImplementation((p: string) => {
			if (p === "/home/test/.agents/skills/using-xtrm/SKILL.md") return true;
			if (p.endsWith("ROADMAP.md")) return false;
			if (p.endsWith(".claude/rules")) return false;
			if (p.endsWith(".claude/skills")) return false;
			return false;
		});

		(fs.readFileSync as any).mockImplementation((p: string) => {
			if (p === "/home/test/.agents/skills/using-xtrm/SKILL.md") {
				return "---\nname: using-xtrm\n---\n# Manual\nUse bd prime";
			}
			return "";
		});

		xtrmLoaderExtension(harness.pi);
		await harness.emit("session_start", {});
		const result = await harness.emit("before_agent_start", { systemPrompt: "Base prompt" });

		expect(result?.systemPrompt).toContain("XTRM Session Operating Manual");
		expect(result?.systemPrompt).toContain("Use bd prime");
		expect(result?.systemPrompt).not.toContain("name: using-xtrm");
	});

	it("falls back to ~/.pi/agent/skills when ~/.agents path is missing", async () => {
		(fs.existsSync as any).mockImplementation((p: string) => {
			if (p === "/home/test/.agents/skills/using-xtrm/SKILL.md") return false;
			if (p === "/home/test/.pi/agent/skills/using-xtrm/SKILL.md") return true;
			if (p.endsWith("ROADMAP.md")) return false;
			if (p.endsWith(".claude/rules")) return false;
			if (p.endsWith(".claude/skills")) return false;
			return false;
		});

		(fs.readFileSync as any).mockReturnValue("# Manual\nPi fallback path");

		xtrmLoaderExtension(harness.pi);
		await harness.emit("session_start", {});
		const result = await harness.emit("before_agent_start", { systemPrompt: "Base" });

		expect(result?.systemPrompt).toContain("Pi fallback path");
	});
});
