/**
 * Utility functions for Ralph Wiggum
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { LoopState } from "./types.js";

export const RALPH_DIR = ".ralph";
export const COMPLETE_MARKER = "<promise>COMPLETE</promise>";

export const DEFAULT_TEMPLATE = `# Task

Describe your task here.

## Goals
- Goal 1
- Goal 2

## Checklist
- [ ] Item 1
- [ ] Item 2

## GitNexus Symbols
- symbol1: to check

## Verification
- Commands run, outputs, evidence

## Notes
(Update with progress, decisions, blockers)
`;

export const DEFAULT_REFLECT_INSTRUCTIONS = `REFLECTION CHECKPOINT

Pause and reflect on your progress:
1. What has been accomplished so far?
2. What's working well?
3. What's not working or blocking progress?
4. Should the approach be adjusted?
5. What are the next priorities?

Run gitnexus_detect_changes() to verify scope.
Update the task file with your reflection, then continue working.`;

// --- File helpers ---

export const ralphDir = (cwd: string) => path.resolve(cwd, RALPH_DIR);
export const archiveDir = (cwd: string) => path.join(ralphDir(cwd), "archive");
export const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");

export function getPath(cwd: string, name: string, ext: string, archived = false): string {
	const dir = archived ? archiveDir(cwd) : ralphDir(cwd);
	return path.join(dir, `${sanitize(name)}${ext}`);
}

export function ensureDir(filePath: string): void {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function tryDelete(filePath: string): void {
	try {
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
	} catch { /* ignore */ }
}

export function tryRead(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

export function tryRemoveDir(dirPath: string): boolean {
	try {
		if (fs.existsSync(dirPath)) {
			fs.rmSync(dirPath, { recursive: true, force: true });
		}
		return true;
	} catch {
		return false;
	}
}

// --- State management ---

export function migrateState(raw: Partial<LoopState> & { name: string }): LoopState {
	if (!raw.status) raw.status = "active";
	if (!raw.gitnexusSymbols) raw.gitnexusSymbols = [];
	if (!raw.lastReflectionAt) raw.lastReflectionAt = 0;
	
	// Migrate old field names
	if ("reflectEveryItems" in raw && !raw.reflectEvery) {
		raw.reflectEvery = (raw as any).reflectEveryItems;
	}
	if ("lastReflectionAtItems" in raw && raw.lastReflectionAt === undefined) {
		raw.lastReflectionAt = (raw as any).lastReflectionAtItems;
	}
	
	return raw as LoopState;
}

export function loadState(cwd: string, name: string, archived = false): LoopState | null {
	const content = tryRead(getPath(cwd, name, ".state.json", archived));
	return content ? migrateState(JSON.parse(content)) : null;
}

export function saveState(cwd: string, state: LoopState, archived = false): void {
	const filePath = getPath(cwd, state.name, ".state.json", archived);
	ensureDir(filePath);
	fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export function listLoops(cwd: string, archived = false): LoopState[] {
	const dir = archived ? archiveDir(cwd) : ralphDir(cwd);
	if (!fs.existsSync(dir)) return [];
	
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".state.json"))
		.map((f) => {
			const content = tryRead(path.join(dir, f));
			return content ? migrateState(JSON.parse(content)) : null;
		})
		.filter((s): s is LoopState => s !== null);
}

// --- Prompt building ---

export function buildPrompt(state: LoopState, taskContent: string, isReflection: boolean): string {
	const maxStr = state.maxIterations > 0 ? `/${state.maxIterations}` : "";
	const header = `───────────────────────────────────────────────────────────────────────
🔄 RALPH LOOP: ${state.name} | Iteration ${state.iteration}${maxStr}${isReflection ? " | 🪞 REFLECTION" : ""}
${state.linkedIssueId ? `📋 Linked Issue: ${state.linkedIssueId}` : ""}
───────────────────────────────────────────────────────────────────────`;

	const parts = [header, ""];
	
	if (isReflection) {
		parts.push(state.reflectInstructions, "\n---\n");
	}

	parts.push(`## Current Task (from ${state.taskFile})\n\n${taskContent}\n\n---`);
	parts.push(`\n## Instructions\n`);
	parts.push("User controls: ESC pauses. Send message to resume. /ralph-stop ends loop.\n");
	parts.push(`You are in a Ralph loop (iteration ${state.iteration}${state.maxIterations > 0 ? ` of ${state.maxIterations}` : ""}).\n`);

	if (state.itemsPerIteration > 0) {
		parts.push(`**THIS ITERATION: Process ~${state.itemsPerIteration} items, then call ralph_done.**\n`);
		parts.push(`1. Work on next ~${state.itemsPerIteration} items from checklist`);
	} else {
		parts.push(`1. Continue working on the task`);
	}
	
	parts.push(`2. Update task file (${state.taskFile}) with progress`);
	parts.push(`3. Run gitnexus_impact before editing new symbols`);
	parts.push(`4. When FULLY COMPLETE, respond with: ${COMPLETE_MARKER}`);
	parts.push(`5. Otherwise, call ralph_done tool for next iteration`);

	if (state.linkedIssueId) {
		parts.push(`\n**When complete:** bd close ${state.linkedIssueId} --reason "Done"`);
	}

	return parts.join("\n");
}

// --- Arg parsing ---

export function parseArgs(argsStr: string) {
	const tokens = argsStr.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
	const result = {
		name: "",
		maxIterations: 50,
		itemsPerIteration: 0,
		reflectEvery: 0,
		reflectInstructions: DEFAULT_REFLECT_INSTRUCTIONS,
		fromIssue: "",
	};

	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i];
		const next = tokens[i + 1];
		if (tok === "--max-iterations" && next) {
			result.maxIterations = parseInt(next, 10) || 0;
			i++;
		} else if (tok === "--items-per-iteration" && next) {
			result.itemsPerIteration = parseInt(next, 10) || 0;
			i++;
		} else if (tok === "--reflect-every" && next) {
			result.reflectEvery = parseInt(next, 10) || 0;
			i++;
		} else if (tok === "--reflect-instructions" && next) {
			result.reflectInstructions = next.replace(/^"|"$/g, "");
			i++;
		} else if (tok === "--from-issue" && next) {
			result.fromIssue = next;
			i++;
		} else if (!tok.startsWith("--")) {
			result.name = tok;
		}
	}
	return result;
}
