/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 */

import type { PlanStep, IssueType, IssuePriority, Layer } from "./types.js";
import { classifyLayer, detectIssueType, derivePriority } from "./test-planning.js";

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
	// Add bd read-only commands
	/^\s*bd\s+(ready|list|show|status|search|graph|blocked|stale|children|epic\s+list)\b/,
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

/**
 * Extract plan steps from a message, with full classification
 */
export function extractPlanSteps(message: string): PlanStep[] {
	const steps: PlanStep[] = [];
	const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
	if (!headerMatch) return steps;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
	const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

	const allMatches = [...planSection.matchAll(numberedPattern)];
	
	for (const match of allMatches) {
		const stepNum = parseInt(match[1], 10);
		const text = match[2]
			.trim()
			.replace(/\*{1,2}$/, "")
			.trim();
		
		if (text.length > 5 && !text.startsWith("`") && !text.startsWith("/") && !text.startsWith("-")) {
			const cleaned = cleanStepText(text);
			if (cleaned.length > 3) {
				const layer = classifyLayer(cleaned);
				const type = detectIssueType(cleaned);
				const priority = derivePriority(stepNum, allMatches.length, false);
				
				steps.push({
					step: stepNum,
					text: cleaned,
					type,
					priority,
					layer,
					dependencies: [],
					gitnexusSymbols: []
				});
			}
		}
	}
	return steps;
}

// Legacy function for backward compatibility
export function extractTodoItems(message: string): TodoItem[] {
	const steps = extractPlanSteps(message);
	return steps.map(s => ({ step: s.step, text: s.text, completed: false }));
}

export function extractDoneSteps(message: string): number[] {
	const steps: number[] = [];
	for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
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

/**
 * Derive epic title from user prompt or plan content
 */
export function deriveEpicTitle(userPrompt: string, steps: PlanStep[]): string {
	// Try to extract from first sentence of user prompt
	const firstSentence = userPrompt.split(/[.!?]/)[0].trim();
	if (firstSentence.length > 10 && firstSentence.length < 80) {
		return firstSentence;
	}
	
	// Use first step as basis
	if (steps.length > 0) {
		const firstStep = steps[0].text;
		if (firstStep.length < 60) {
			return firstStep;
		}
		return firstStep.slice(0, 57) + "...";
	}
	
	// Fallback
	return `Plan: ${new Date().toISOString().split('T')[0]}`;
}

/**
 * Generate issue description with GitNexus safety reminders
 */
export function generateIssueDescription(
	step: PlanStep,
	issueId: string,
	gitnexusSymbols: string[]
): string {
	const symbolsSection = gitnexusSymbols.length > 0
		? `\n\n## GitNexus Safety\nAffected symbols: ${gitnexusSymbols.join(", ")}\n\nBefore editing:\n- gitnexus_impact({target: "<symbol>"})\n- Check d=1 callers\n\nBefore commit:\n- gitnexus_detect_changes({scope: "staged"})`
		: "\n\n## GitNexus Safety\nRun gitnexus_impact before editing affected code.";

	return `${step.text}${symbolsSection}\n\n## Testing\n- Layer: ${step.layer}\n- Run gitnexus_impact before editing\n- Test issue will be created`;
}

/**
 * Extract GitNexus symbols from tool result content
 */
export function extractGitNexusSymbols(content: string): string[] {
	const symbols: string[] = [];
	// Match symbol names from gitnexus output patterns
	const patterns = [
		/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,  // function calls
		/class\s+([A-Z][a-zA-Z0-9_]*)/g,       // class definitions
		/interface\s+([A-Z][a-zA-Z0-9_]*)/g,   // interfaces
	];
	
	for (const pattern of patterns) {
		for (const match of content.matchAll(pattern)) {
			if (match[1] && !symbols.includes(match[1])) {
				symbols.push(match[1]);
			}
		}
	}
	
	return symbols.slice(0, 10); // Limit to 10 symbols
}
