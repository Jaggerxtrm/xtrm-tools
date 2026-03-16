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

	// 2. Skill Activation + 3. Drift Detection
	pi.on("tool_result", async (event, ctx) => {
		const cwd = getCwd(ctx);
		const hookInput = JSON.stringify({
			tool_name: toClaudeToolName(event.toolName),
			tool_input: event.input,
			cwd,
		});

		const messages: string[] = [];

		const activatorPath = path.join(cwd, ".claude", "skills", "using-service-skills", "scripts", "skill_activator.py");
		if (fs.existsSync(activatorPath)) {
			const activation = await SubprocessRunner.run("python3", [activatorPath], {
				cwd,
				input: hookInput,
				env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
				timeoutMs: 10000,
			});
			if (activation.code === 0 && activation.stdout.trim()) {
				messages.push(activation.stdout.trim());
			}
		}

		const driftDetectorPath = path.join(cwd, ".claude", "skills", "updating-service-skills", "scripts", "drift_detector.py");
		if (fs.existsSync(driftDetectorPath)) {
			const drift = await SubprocessRunner.run("python3", [driftDetectorPath], {
				cwd,
				input: hookInput,
				env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
				timeoutMs: 10000,
			});
			if (drift.code === 0 && drift.stdout.trim()) {
				messages.push(drift.stdout.trim());
			}
		}

		if (messages.length > 0) {
			const newContent = [...event.content];
			newContent.push({ type: "text", text: "\n\n" + messages.join("\n\n") });
			return { content: newContent };
		}

		return undefined;
	});
}
