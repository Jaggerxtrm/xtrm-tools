/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Destructive commands blocked in plan mode
const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

// Safe read-only commands allowed in plan mode
const SAFE_PATTERNS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*curl\s/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*exa\b/,
];

export function isSafeCommand(command: string): boolean {
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(command));
	return !isDestructive && isSafe;
}

export interface TodoItem {
	step: number;
	text: string;
	completed: boolean;
}

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // Remove bold/italic
		.replace(/`([^`]+)`/g, "$1") // Remove code
		.replace(
			/^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i,
			"",
		)
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	if (cleaned.length > 50) {
		cleaned = `${cleaned.slice(0, 47)}...`;
	}
	return cleaned;
}

export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
	const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

	const matches = Array.from(planSection.matchAll(numberedPattern));
	for (const match of matches) {
		const text = match[2]
			.trim()
			.replace(/\*{1,2}$/, "")
			.trim();
		if (text.length > 5 && !text.startsWith("`") && !text.startsWith("/") && !text.startsWith("-")) {
			const cleaned = cleanStepText(text);
			if (cleaned.length > 3) {
				items.push({ step: items.length + 1, text: cleaned, completed: false });
			}
		}
	}
	return items;
}

export function extractDoneSteps(message: string): number[] {
	const steps: number[] = [];
	const matches = Array.from(message.matchAll(/\[DONE:(\d+)\]/gi));
	for (const match of matches) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
	const doneSteps = extractDoneSteps(text);
	for (const step of doneSteps) {
		const item = items.find((t) => t.step === step);
		if (item) item.completed = true;
	}
	return doneSteps.length;
}

// =============================================================================
// bd (beads) Integration Functions
// =============================================================================

/**
 * Extract short ID from full bd issue ID.
 * Example: "jaggers-agent-tools-xr9b.1" → "xr9b.1"
 */
export function getShortId(fullId: string): string {
	const parts = fullId.split("-");
	// Last part is the ID (e.g., "xr9b.1")
	return parts[parts.length - 1];
}

/**
 * Check if a directory is a beads project (has .beads directory).
 */
export function isBeadsProject(cwd: string): boolean {
	return existsSync(join(cwd, ".beads"));
}

/**
 * Derive epic title from user prompt or conversation messages.
 */
export function deriveEpicTitle(messages: Array<{ role: string; content?: unknown }>): string {
	// Find the last user message
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "user") {
			const content = msg.content;
			if (typeof content === "string") {
				// Extract first sentence or first 50 chars
				const firstSentence = content.split(/[.!?\n]/)[0].trim();
				if (firstSentence.length > 10 && firstSentence.length < 80) {
					return firstSentence;
				}
				if (firstSentence.length >= 80) {
					return `${firstSentence.slice(0, 77)}...`;
				}
			}
		}
	}
	return "Plan execution";
}

/**
 * Run a bd command and return the result.
 */
function runBd(args: string[], cwd: string): { stdout: string; stderr: string; status: number } {
	const result = spawnSync("bd", args, {
		cwd,
		encoding: "utf8",
		timeout: 30000,
	});
	return {
		stdout: result.stdout || "",
		stderr: result.stderr || "",
		status: result.status ?? 1,
	};
}

/**
 * Create an epic in bd.
 */
export function bdCreateEpic(title: string, cwd: string): { id: string; title: string } | null {
	const result = runBd(["create", title, "-t", "epic", "-p", "1", "--json"], cwd);
	if (result.status === 0) {
		try {
			const data = JSON.parse(result.stdout);
			if (Array.isArray(data) && data[0]) {
				return { id: data[0].id, title: data[0].title };
			}
		} catch {
			// Parse the ID from stdout if JSON parse fails
			const match = result.stdout.match(/Created issue:\s*(\S+)/);
			if (match) {
				return { id: match[1], title };
			}
		}
	}
	return null;
}

/**
 * Create a task issue in bd under an epic.
 */
export function bdCreateIssue(
	title: string,
	description: string,
	parentId: string,
	cwd: string,
): { id: string; title: string } | null {
	const result = runBd(
		["create", title, "-t", "task", "-p", "1", "--parent", parentId, "-d", description, "--json"],
		cwd,
	);
	if (result.status === 0) {
		try {
			const data = JSON.parse(result.stdout);
			if (Array.isArray(data) && data[0]) {
				return { id: data[0].id, title: data[0].title };
			}
		} catch {
			const match = result.stdout.match(/Created issue:\s*(\S+)/);
			if (match) {
				return { id: match[1], title };
			}
		}
	}
	return null;
}

/**
 * Claim an issue in bd.
 */
export function bdClaim(issueId: string, cwd: string): boolean {
	const result = runBd(["update", issueId, "--claim"], cwd);
	return result.status === 0;
}

/**
 * Result of creating plan issues.
 */
export interface PlanIssuesResult {
	epic: { id: string; title: string };
	issues: Array<{ id: string; title: string }>;
}

/**
 * Create an epic and issues from todo items.
 */
export function createPlanIssues(
	epicTitle: string,
	todos: TodoItem[],
	cwd: string,
): PlanIssuesResult | null {
	const epic = bdCreateEpic(epicTitle, cwd);
	if (!epic) return null;

	const issues: Array<{ id: string; title: string }> = [];
	for (const todo of todos) {
		const issue = bdCreateIssue(todo.text, `Step ${todo.step} of plan: ${epicTitle}`, epic.id, cwd);
		if (issue) {
			issues.push(issue);
		}
	}

	return { epic, issues };
}
