/**
 * Type definitions for beads-integrated plan mode
 */

export interface PlanStep {
	step: number;
	text: string;
	type: IssueType;
	priority: IssuePriority;
	layer: Layer;
	dependencies: number[];
	gitnexusSymbols: string[];
}

export type IssueType = "feature" | "task" | "bug" | "chore";
export type IssuePriority = 0 | 1 | 2 | 3 | 4;
export type Layer = "core" | "boundary" | "shell" | "unknown";

export interface IssueRef {
	id: string;
	step: number;
	title: string;
	status: "open" | "in_progress" | "closed";
	type: IssueType;
	layer: Layer;
	testIssueId?: string;
}

export interface EpicState {
	epicId: string;
	epicTitle: string;
	issueIds: string[];
	stepMapping: Record<number, string>;
	gitnexusSymbols: Record<number, string[]>;
	createdAt: number;
}

export interface PlanModeState {
	enabled: boolean;
	executing: boolean;
	epic?: EpicState;
	issues: IssueRef[];
	currentIssueId?: string;
	planText?: string;
	userPrompt?: string;
}

export interface BdIssue {
	id: string;
	title: string;
	type: IssueType;
	priority: IssuePriority;
	status: "open" | "in_progress" | "closed";
	parent?: string;
	description?: string;
	labels?: string[];
}

export interface BdCreateResult {
	id: string;
	title: string;
	success: boolean;
}

export interface LayerClassification {
	layer: Layer;
	signals: string[];
}
