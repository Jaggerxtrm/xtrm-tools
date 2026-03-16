import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { Logger } from "./core";

const logger = new Logger({ namespace: "xtrm-loader" });

/**
 * Recursively find markdown files in a directory.
 */
function findMarkdownFiles(dir: string, basePath: string = ""): string[] {
	const results: string[] = [];
	if (!fs.existsSync(dir)) return results;

	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			results.push(...findMarkdownFiles(path.join(dir, entry.name), relativePath));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			results.push(relativePath);
		}
	}
	return results;
}

export default function (pi: ExtensionAPI) {
	let projectContext: string = "";

	pi.on("session_start", async (_event, ctx) => {
		const cwd = ctx.cwd;
		const contextParts: string[] = [];

		// 1. Architecture & Roadmap
		const roadmapPaths = [
			path.join(cwd, "architecture", "project_roadmap.md"),
			path.join(cwd, "ROADMAP.md"),
			path.join(cwd, "architecture", "index.md")
		];

		for (const p of roadmapPaths) {
			if (fs.existsSync(p)) {
				const content = fs.readFileSync(p, "utf8");
				contextParts.push(`## Project Roadmap & Architecture (${path.relative(cwd, p)})\n\n${content}`);
				break; // Only load the first one found
			}
		}

		// 2. Project Rules (.claude/rules)
		const rulesDir = path.join(cwd, ".claude", "rules");
		if (fs.existsSync(rulesDir)) {
			const ruleFiles = findMarkdownFiles(rulesDir);
			if (ruleFiles.length > 0) {
				const rulesContent = ruleFiles.map(f => {
					const content = fs.readFileSync(path.join(rulesDir, f), "utf8");
					return `### Rule: ${f}\n${content}`;
				}).join("\n\n");
				contextParts.push(`## Project Rules\n\n${rulesContent}`);
			}
		}

		// 3. Specialist Reminder
		const specialistsDir = path.join(process.env.HOME || "", "projects", "specialists");
		if (fs.existsSync(specialistsDir)) {
			contextParts.push(`## Specialists Available\nExpert specialists are available in ${specialistsDir}. Use them for deep reasoning or complex sub-tasks.`);
		}

		projectContext = contextParts.join("\n\n---\n\n");
		
		if (projectContext && ctx.hasUI) {
			ctx.ui.notify("XTRM-Loader: Project context injected into system prompt", "info");
		}
	});

	pi.on("before_agent_start", async (event) => {
		if (!projectContext) return undefined;

		return {
			systemPrompt: event.systemPrompt + "\n\n# Project Intelligence Context\n\n" + projectContext
		};
	});
}
