/**
 * Test planning utilities - layer classification and test issue creation
 */

import type { PlanStep, Layer, IssueType } from "./types.js";

// Signal patterns for layer detection
const CORE_SIGNALS = [
	"implement", "compute", "calculate", "format", "parse", "validate",
	"config", "transform", "process", "merge", "convert", "generate",
	"encode", "decode", "serialize", "deserialize", "analyze"
];

const BOUNDARY_SIGNALS = [
	"endpoint", "API", "client", "route", "fetch", "query", "HTTP",
	"request", "response", "database", "DB", "cache", "queue",
	"webhook", "fetch", "POST", "GET", "PUT", "DELETE", "service"
];

const SHELL_SIGNALS = [
	"command", "CLI", "subcommand", "workflow", "orchestrate",
	"pipeline", "handler", "runner", "executor", "main", "entry"
];

/**
 * Classify which architectural layer a step touches
 */
export function classifyLayer(stepText: string): Layer {
	const text = stepText.toLowerCase();
	
	const coreMatches = CORE_SIGNALS.filter(s => text.includes(s.toLowerCase()));
	const boundaryMatches = BOUNDARY_SIGNALS.filter(s => text.includes(s.toLowerCase()));
	const shellMatches = SHELL_SIGNALS.filter(s => text.includes(s.toLowerCase()));
	
	const scores = {
		core: coreMatches.length,
		boundary: boundaryMatches.length,
		shell: shellMatches.length
	};
	
	const max = Math.max(scores.core, scores.boundary, scores.shell);
	if (max === 0) return "unknown";
	
	if (scores.core === max) return "core";
	if (scores.boundary === max) return "boundary";
	return "shell";
}

/**
 * Detect issue type from step text
 */
export function detectIssueType(stepText: string): IssueType {
	const text = stepText.toLowerCase();
	
	if (/\b(fix|bug|error|crash|broken|issue|problem)\b/.test(text)) return "bug";
	if (/\b(test|document|refactor|clean|update\s+dep|upgrade)\b/.test(text)) return "task";
	if (/\b(configure|setup|install|deploy)\b/.test(text)) return "chore";
	return "feature";
}

/**
 * Derive priority based on position and dependencies
 */
export function derivePriority(step: number, totalSteps: number, hasDeps: boolean): 0 | 1 | 2 | 3 | 4 {
	// First steps are higher priority
	if (step <= 2) return 1;
	// Steps with dependencies blocking others
	if (hasDeps && step < totalSteps) return 1;
	// Middle steps
	if (step <= totalSteps * 0.6) return 2;
	// Later steps
	return 3;
}

/**
 * Get testing strategy for a layer
 */
export function getTestingStrategy(layer: Layer): { strategy: string; description: string } {
	switch (layer) {
		case "core":
			return {
				strategy: "unit",
				description: "Unit tests + property-based tests for pure domain logic"
			};
		case "boundary":
			return {
				strategy: "contract",
				description: "Contract tests (live preferred) for I/O boundaries"
			};
		case "shell":
			return {
				strategy: "integration",
				description: "Integration tests for end-to-end workflows"
			};
		default:
			return {
				strategy: "unit",
				description: "Unit tests"
			};
	}
}

/**
 * Batch steps by layer for test issue creation
 */
export function batchByLayer(steps: PlanStep[]): Map<Layer, PlanStep[]> {
	const batches = new Map<Layer, PlanStep[]>();
	
	for (const step of steps) {
		const layer = step.layer;
		if (!batches.has(layer)) batches.set(layer, []);
		batches.get(layer)!.push(step);
	}
	
	return batches;
}

/**
 * Generate test issue title
 */
export function generateTestIssueTitle(layer: Layer, steps: PlanStep[]): string {
	const strategy = getTestingStrategy(layer);
	return `Test: ${layer} layer - ${strategy.strategy} tests`;
}

/**
 * Generate test issue description
 */
export function generateTestIssueDescription(
	layer: Layer,
	steps: PlanStep[],
	issueIds: Map<number, string>
): string {
	const strategy = getTestingStrategy(layer);
	const coveredIssues = steps
		.map(s => issueIds.get(s.step))
		.filter(Boolean)
		.map(id => `- ${id}`)
		.join("\n");
	
	return `## Test Coverage For
${coveredIssues}

## Layer
${layer} (${strategy.description})

## Strategy
${strategy.strategy} tests

## AC
- [ ] Tests written and passing
- [ ] Coverage meets threshold
- [ ] No regressions in existing tests`;
}
