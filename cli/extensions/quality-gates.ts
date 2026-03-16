import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, EventAdapter, Logger } from "./core";
import * as path from "node:path";
import * as fs from "node:fs";

const logger = new Logger({ namespace: "quality-gates" });

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", async (event, ctx) => {
		if (!EventAdapter.isMutatingFileTool(event)) return undefined;

		const cwd = ctx.cwd || process.cwd();
		const filePath = EventAdapter.extractPathFromToolInput(event, cwd);
		if (!filePath) return undefined;

		const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
		const ext = path.extname(fullPath);

		let scriptPath: string | null = null;
		let runner: string = "node";

		if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
			scriptPath = path.join(cwd, ".claude", "hooks", "quality-check.cjs");
			runner = "node";
		} else if (ext === ".py") {
			scriptPath = path.join(cwd, ".claude", "hooks", "quality-check.py");
			runner = "python3";
		}

		if (!scriptPath || !fs.existsSync(scriptPath)) return undefined;

		const hookInput = JSON.stringify({
			tool_name: event.toolName,
			tool_input: event.input,
			cwd: cwd,
		});

		const result = await SubprocessRunner.run(runner, [scriptPath], {
			cwd,
			input: hookInput,
			env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
			timeoutMs: 30000,
		});

		if (result.code === 0) {
			if (result.stderr && result.stderr.trim()) {
				const newContent = [...event.content];
				newContent.push({ type: "text", text: `\n\n**Quality Gate**: ${result.stderr.trim()}` });
				return { content: newContent };
			}
			return undefined;
		}

		if (result.code === 2) {
			const newContent = [...event.content];
			newContent.push({ type: "text", text: `\n\n**Quality Gate FAILED**:\n${result.stderr || result.stdout || "Unknown error"}` });
			
			if (ctx.hasUI) {
				ctx.ui.notify(`Quality Gate failed for ${path.basename(fullPath)}`, "error");
			}

			return { isError: true, content: newContent };
		}

		return undefined;
	});
}
