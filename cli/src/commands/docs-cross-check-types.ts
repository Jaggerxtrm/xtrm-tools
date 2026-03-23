import type { DocEntry } from '../utils/docs-scanner.js';

// ── GitHub boundary types ─────────────────────────────────────────────────────

export interface GhPr {
    number: number;
    title: string;
    mergedAt: string | null;
    url: string;
    headRefName: string;
    files?: string[];
}

export interface GhIssue {
    number: number;
    title: string;
    closedAt: string | null;
    url: string;
    labels: string[];
}

// ── Beads boundary types ──────────────────────────────────────────────────────

export interface BdIssue {
    id: string;
    title: string;
    status: string;
    closedAt: string | null;
    type: string;
}

// ── Doc model extension ───────────────────────────────────────────────────────

export interface DocCrossCheckEntry extends DocEntry {
    mentionedIssueIds: string[];
}

// ── Cross-check output types ──────────────────────────────────────────────────

export interface CrossCheckFinding {
    severity: 'critical' | 'warning' | 'info';
    kind: 'stale' | 'coverage-gap' | 'ref-invalid';
    docPath: string;
    message: string;
    detail?: string;
}

export interface CrossCheckResult {
    docsChecked: number;
    findingsTotal: number;
    findings: CrossCheckFinding[];
    generatedAt: string;
}

export interface CrossCheckOptions {
    json: boolean;
    days: number;
    repoRoot: string;
}
