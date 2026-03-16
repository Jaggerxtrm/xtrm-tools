import type { ExtensionAPI, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType, isBashToolResult } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, Logger } from "./core/lib";
import * as path from "node:path";
import * as fs from "node:fs";

const logger = new Logger({ namespace: "service-skills" });

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


	// 3. Drift Detection
	pi.on("tool_result", async (event, ctx) => {
		const cwd = getCwd(ctx);
		const driftDetectorPath = path.join(cwd, ".claude", "skills", "updating-service-skills", "scripts", "drift_detector.py");
		if (!fs.existsSync(driftDetectorPath)) return undefined;

		const hookInput = JSON.stringify({
			tool_name: event.toolName === "bash" ? "Bash" : event.toolName,
			tool_input: event.input,
			cwd: cwd
		});

		const result = await SubprocessRunner.run("python3", [driftDetectorPath], {
			cwd,
			input: hookInput,
			env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
			timeoutMs: 10000
		});

		if (result.code === 0 && result.stdout.trim()) {
			const newContent = [...event.content];
			newContent.push({ type: "text", text: "\n\n" + result.stdout.trim() });
			return { content: newContent };
		}
		return undefined;
	});
}
