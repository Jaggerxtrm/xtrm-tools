import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner } from "./core/lib";
import * as path from "node:path";
import * as fs from "node:fs";

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();

	// 1. Catalog Injection
	pi.on("before_agent_start", async (event, ctx) => {
		const cwd = getCwd(ctx);
		const catalogerPath = path.join(cwd, ".claude", "skills", "using-service-skills", "scripts", "cataloger.py");
		if (!fs.existsSync(catalogerPath)) return undefined;

		const result = await SubprocessRunner.run("python3", [catalogerPath], {
			cwd,
			env: { ...process.env, CLAUDE_PROJECT_DIR: cwd }
		});

		if (result.code === 0 && result.stdout.trim()) {
			return { systemPrompt: event.systemPrompt + "\n\n" + result.stdout.trim() };
		}
		return undefined;
	});


	const toClaudeToolName = (toolName: string): string => {
		if (toolName === "bash") return "Bash";
		if (toolName === "read_file") return "Read";
		if (toolName === "write" || toolName === "create_text_file") return "Write";
		if (toolName === "edit" || toolName === "replace_content" || toolName === "replace_lines" || toolName === "insert_at_line" || toolName === "delete_lines") return "Edit";
		if (toolName === "search_for_pattern") return "Grep";
		if (toolName === "find_file" || toolName === "list_dir") return "Glob";
		return toolName;
	};

	// 2. Drift Detection (skill activation is before_agent_start only — not per-tool)
	pi.on("tool_result", async (event, ctx) => {
		const cwd = getCwd(ctx);
		const driftDetectorPath = path.join(cwd, ".claude", "skills", "updating-service-skills", "scripts", "drift_detector.py");
		if (!fs.existsSync(driftDetectorPath)) return undefined;

		const hookInput = JSON.stringify({
			tool_name: toClaudeToolName(event.toolName),
			tool_input: event.input,
			cwd,
		});

		const result = await SubprocessRunner.run("python3", [driftDetectorPath], {
			cwd,
			input: hookInput,
			env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
			timeoutMs: 10000,
		});

		if (result.code === 0 && result.stdout.trim()) {
			const newContent = [...event.content];
			newContent.push({ type: "text", text: "\n\n" + result.stdout.trim() });
			return { content: newContent };
		}

		return undefined;
	});
}
