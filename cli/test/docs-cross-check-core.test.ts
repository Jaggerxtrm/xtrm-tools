import { describe, it, expect } from 'vitest';
import {
    detectStaleDocs,
    detectCoverageGaps,
    validateIssueReferences,
    buildReport,
} from '../src/commands/docs-cross-check-core.js';
import type { DocEntry } from '../src/utils/docs-scanner.js';
import type { GhPr, BdIssue, CrossCheckFinding } from '../src/commands/docs-cross-check-types.js';

// ── Test fixtures ────────────────────────────────────────────────────────────

const makeDoc = (overrides: Partial<DocEntry> = {}): DocEntry => ({
    filePath: '/repo/README.md',
    relativePath: 'README.md',
    frontmatter: null,
    sizeBytes: 100,
    lastModified: new Date('2026-03-15'),
    ...overrides,
});

const makePr = (overrides: Partial<GhPr> = {}): GhPr => ({
    number: 42,
    title: 'Add feature',
    mergedAt: '2026-03-20T10:00:00Z',
    url: 'https://github.com/test/pr/42',
    headRefName: 'feature/test',
    ...overrides,
});

const makeBdIssue = (overrides: Partial<BdIssue> = {}): BdIssue => ({
    id: 'xtrm-abc1',
    title: 'Feature X',
    status: 'closed',
    type: 'feature',
    closedAt: '2026-03-18T10:00:00Z',
    ...overrides,
});

// ── detectStaleDocs ──────────────────────────────────────────────────────────

describe('detectStaleDocs', () => {
    it('emits warning when PR merged after doc lastModified', () => {
        const docs = [makeDoc({ lastModified: new Date('2026-03-15') })];
        const prs = [makePr({ mergedAt: '2026-03-20T10:00:00Z' })];

        const findings = detectStaleDocs(docs, prs, 30);

        expect(findings).toHaveLength(1);
        expect(findings[0].severity).toBe('warning');
        expect(findings[0].kind).toBe('stale');
        expect(findings[0].message).toContain('1 PR');
    });

    it('returns empty array when no PRs in window', () => {
        const docs = [makeDoc({ lastModified: new Date('2026-03-15') })];
        const prs: GhPr[] = [];

        const findings = detectStaleDocs(docs, prs, 30);

        expect(findings).toEqual([]);
    });

    it('returns empty array when doc modified after all PRs', () => {
        const docs = [makeDoc({ lastModified: new Date('2026-03-25') })];
        const prs = [makePr({ mergedAt: '2026-03-20T10:00:00Z' })];

        const findings = detectStaleDocs(docs, prs, 30);

        expect(findings).toEqual([]);
    });

    it('emits info when frontmatter updated_at differs from mtime by >7 days', () => {
        const docs = [makeDoc({
            lastModified: new Date('2026-03-20'),
            frontmatter: { updated_at: '2026-03-01' },
        })];
        const prs: GhPr[] = [];

        const findings = detectStaleDocs(docs, prs, 30);

        expect(findings).toHaveLength(1);
        expect(findings[0].severity).toBe('info');
        expect(findings[0].message).toContain('updated_at differs');
    });

    it('emits no finding when updated_at matches mtime', () => {
        const docs = [makeDoc({
            lastModified: new Date('2026-03-20'),
            frontmatter: { updated_at: '2026-03-19' }, // 1 day diff, within tolerance
        })];
        const prs: GhPr[] = [];

        const findings = detectStaleDocs(docs, prs, 30);

        expect(findings).toEqual([]);
    });

    it('skips docs with parse errors', () => {
        const docs = [makeDoc({ parseError: 'Failed to parse' })];
        const prs = [makePr()];

        const findings = detectStaleDocs(docs, prs, 30);

        expect(findings).toEqual([]);
    });

    it('handles multiple PRs merged after doc', () => {
        const docs = [makeDoc({ lastModified: new Date('2026-03-10') })];
        const prs = [
            makePr({ number: 1, mergedAt: '2026-03-15T10:00:00Z' }),
            makePr({ number: 2, mergedAt: '2026-03-18T10:00:00Z' }),
        ];

        const findings = detectStaleDocs(docs, prs, 30);

        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('2 PRs');
    });
});

// ── detectCoverageGaps ───────────────────────────────────────────────────────

describe('detectCoverageGaps', () => {
    it('emits warning for closed feature issue not mentioned in docs', () => {
        const docs = [makeDoc()];
        const issues = [makeBdIssue({ id: 'xtrm-xyz1', type: 'feature', status: 'closed' })];
        const contents = new Map([['README.md', 'No issue refs here']]);

        const findings = detectCoverageGaps(docs, issues, contents);

        expect(findings).toHaveLength(1);
        expect(findings[0].severity).toBe('warning');
        expect(findings[0].kind).toBe('coverage-gap');
        expect(findings[0].message).toContain('xtrm-xyz1');
    });

    it('returns empty when feature issue is mentioned in doc', () => {
        const docs = [makeDoc()];
        const issues = [makeBdIssue({ id: 'xtrm-xyz1', type: 'feature', status: 'closed' })];
        const contents = new Map([['README.md', 'See xtrm-xyz1 for details']]);

        const findings = detectCoverageGaps(docs, issues, contents);

        expect(findings).toEqual([]);
    });

    it('ignores closed bug issues', () => {
        const docs = [makeDoc()];
        const issues = [makeBdIssue({ id: 'xtrm-bug1', type: 'bug', status: 'closed' })];
        const contents = new Map([['README.md', 'No refs']]);

        const findings = detectCoverageGaps(docs, issues, contents);

        expect(findings).toEqual([]);
    });

    it('ignores closed chore issues', () => {
        const docs = [makeDoc()];
        const issues = [makeBdIssue({ id: 'xtrm-chr1', type: 'chore', status: 'closed' })];
        const contents = new Map([['README.md', 'No refs']]);

        const findings = detectCoverageGaps(docs, issues, contents);

        expect(findings).toEqual([]);
    });

    it('ignores open issues', () => {
        const docs = [makeDoc()];
        const issues = [makeBdIssue({ id: 'xtrm-opn1', type: 'feature', status: 'open' })];
        const contents = new Map([['README.md', 'No refs']]);

        const findings = detectCoverageGaps(docs, issues, contents);

        expect(findings).toEqual([]);
    });

    it('returns empty for empty issue list', () => {
        const docs = [makeDoc()];
        const issues: BdIssue[] = [];
        const contents = new Map([['README.md', 'Content']]);

        const findings = detectCoverageGaps(docs, issues, contents);

        expect(findings).toEqual([]);
    });

    it('detects issue ref in frontmatter', () => {
        const docs = [makeDoc({
            frontmatter: { related: 'xtrm-fm01' },
        })];
        const issues = [makeBdIssue({ id: 'xtrm-fm01', type: 'feature', status: 'closed' })];
        const contents = new Map([['README.md', 'No text refs']]);

        const findings = detectCoverageGaps(docs, issues, contents);

        expect(findings).toEqual([]);
    });
});

// ── validateIssueReferences ──────────────────────────────────────────────────

describe('validateIssueReferences', () => {
    it('emits info for reference to open issue', () => {
        const docs = [makeDoc()];
        const issues = [makeBdIssue({ id: 'xtrm-opn1', status: 'open' })];
        const contents = new Map([['README.md', 'See xtrm-opn1 for progress']]);

        const findings = validateIssueReferences(docs, issues, contents);

        expect(findings).toHaveLength(1);
        expect(findings[0].severity).toBe('info');
        expect(findings[0].kind).toBe('ref-invalid');
        expect(findings[0].message).toContain('open issue');
    });

    it('returns empty for reference to closed issue', () => {
        const docs = [makeDoc()];
        const issues = [makeBdIssue({ id: 'xtrm-cls1', status: 'closed' })];
        const contents = new Map([['README.md', 'Fixed in xtrm-cls1']]);

        const findings = validateIssueReferences(docs, issues, contents);

        expect(findings).toEqual([]);
    });

    it('returns empty when no issue refs in doc', () => {
        const docs = [makeDoc()];
        const issues = [makeBdIssue({ id: 'xtrm-xyz1', status: 'open' })];
        const contents = new Map([['README.md', 'No issue refs here']]);

        const findings = validateIssueReferences(docs, issues, contents);

        expect(findings).toEqual([]);
    });

    it('dedupes multiple refs to same issue in one doc', () => {
        const docs = [makeDoc()];
        const issues = [makeBdIssue({ id: 'xtrm-dup1', status: 'open' })];
        const contents = new Map([['README.md', 'See xtrm-dup1 and xtrm-dup1 again']]);

        const findings = validateIssueReferences(docs, issues, contents);

        expect(findings).toHaveLength(1);
    });

    it('handles unknown issue IDs gracefully', () => {
        const docs = [makeDoc()];
        const issues: BdIssue[] = [];
        const contents = new Map([['README.md', 'See xtrm-unk1 for details']]);

        const findings = validateIssueReferences(docs, issues, contents);

        expect(findings).toEqual([]);
    });
});

// ── buildReport ──────────────────────────────────────────────────────────────

describe('buildReport', () => {
    it('sorts findings by severity (critical > warning > info)', () => {
        const findings: CrossCheckFinding[] = [
            { severity: 'info', kind: 'ref-invalid', docPath: 'a.md', message: 'info' },
            { severity: 'warning', kind: 'stale', docPath: 'b.md', message: 'warn' },
            { severity: 'critical', kind: 'stale', docPath: 'c.md', message: 'crit' },
        ];

        const report = buildReport(findings, 5);

        expect(report.findings[0].severity).toBe('critical');
        expect(report.findings[1].severity).toBe('warning');
        expect(report.findings[2].severity).toBe('info');
    });

    it('sets findingsTotal correctly', () => {
        const findings: CrossCheckFinding[] = [
            { severity: 'warning', kind: 'stale', docPath: 'a.md', message: 'w1' },
            { severity: 'warning', kind: 'stale', docPath: 'b.md', message: 'w2' },
        ];

        const report = buildReport(findings, 10);

        expect(report.findingsTotal).toBe(2);
        expect(report.docsChecked).toBe(10);
    });

    it('generates valid ISO date for generatedAt', () => {
        const report = buildReport([], 0);

        expect(() => new Date(report.generatedAt)).not.toThrow();
        expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
    });

    it('handles empty findings', () => {
        const report = buildReport([], 5);

        expect(report.findingsTotal).toBe(0);
        expect(report.findings).toEqual([]);
    });
});