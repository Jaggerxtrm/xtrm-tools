import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { Logger } from "./core/lib";

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

		// 3. Project Skills (.claude/skills)
		const skillsDir = path.join(cwd, ".claude", "skills");
		if (fs.existsSync(skillsDir)) {
			const skillFiles = findMarkdownFiles(skillsDir);
			if (skillFiles.length > 0) {
				const skillsContent = skillFiles.map(f => {
					// We only want to list the paths/names so the agent knows what it can read
					return `- ${f} (Path: .claude/skills/${f})`;
				}).join("\n");
				contextParts.push(`## Available Project Skills\n\nExisting service skills and workflows found in .claude/skills/:\n\n${skillsContent}\n\nUse the read tool to load any of these skills if relevant to the current task.`);
			}
		}

		projectContext = contextParts.join("\n\n---\n\n");
		
		if (projectContext && ctx.hasUI) {
			ctx.ui.notify("XTRM-Loader: Project context and skills indexed", "info");
		}
	});

	pi.on("before_agent_start", async (event) => {
		if (!projectContext) return undefined;

		return {
			systemPrompt: event.systemPrompt + "\n\n# Project Intelligence Context\n\n" + projectContext
		};
	});
}
