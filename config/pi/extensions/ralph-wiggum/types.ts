/**
 * Type definitions for Ralph Wiggum extension
 */

export type LoopStatus = "active" | "paused" | "completed";

export interface LoopState {
	name: string;
	taskFile: string;
	iteration: number;
	maxIterations: number;
	itemsPerIteration: number;
	reflectEvery: number;
	reflectInstructions: string;
	status: LoopStatus;
	startedAt: string;
	completedAt?: string;
	lastReflectionAt: number;
	// XTRM additions
	linkedIssueId?: string;
	gitnexusSymbols: string[];
}

export interface TaskFileContent {
	title: string;
	goals: string[];
	checklist: ChecklistItem[];
	verification: string[];
	notes: string;
	linkedIssue?: LinkedIssue;
}

export interface ChecklistItem {
	text: string;
	completed: boolean;
}

export interface LinkedIssue {
	id: string;
	title: string;
	type: string;
	priority: number;
	layer?: string;
}
