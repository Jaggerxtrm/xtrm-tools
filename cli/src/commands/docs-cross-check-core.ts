import type { DocEntry } from '../utils/docs-scanner.js';
import type { GhPr, BdIssue, CrossCheckFinding, CrossCheckResult } from './docs-cross-check-types.js';

// ── Staleness detector ────────────────────────────────────────────────────────

/**
 * Detect docs that may be stale relative to recent PR activity.
 *
 * Checks:
 * 1. If PRs were merged after doc's lastModified → warning
 * 2. If frontmatter updated_at differs from lastModified by >7 days → info
 */
export function detectStaleDocs(
    docs: DocEntry[],
    prs: GhPr[],
    _days: number,
): CrossCheckFinding[] {
    const findings: CrossCheckFinding[] = [];

    for (const doc of docs) {
        // Skip docs with parse errors
        if (doc.parseError) continue;

        const docDate = doc.lastModified;

        // Check for PRs merged after this doc was last modified
        const mergedAfter = prs.filter(pr => {
            if (!pr.mergedAt) return false;
            return new Date(pr.mergedAt) > docDate;
        });

        if (mergedAfter.length > 0) {
            findings.push({
                severity: 'warning',
                kind: 'stale',
                docPath: doc.relativePath,
                message: `Doc not updated since ${mergedAfter.length} PR${mergedAfter.length > 1 ? 's' : ''} merged`,
                detail: mergedAfter.slice(0, 3).map(pr => `#${pr.number}: ${pr.title}`).join('; '),
            });
        }

        // Check frontmatter updated_at vs lastModified
        const updatedAtStr = doc.frontmatter?.updated_at;
        if (updatedAtStr) {
            const updatedAt = new Date(updatedAtStr);
            if (!isNaN(updatedAt.getTime())) {
                const diffDays = Math.abs(docDate.getTime() - updatedAt.getTime()) / 86400000;
                if (diffDays > 7) {
                    findings.push({
                        severity: 'info',
                        kind: 'stale',
                        docPath: doc.relativePath,
                        message: `Frontmatter updated_at differs from file mtime by ${Math.round(diffDays)} days`,
                    });
                }
            }
        }
    }

    return findings;
}

// ── Coverage gap detector ─────────────────────────────────────────────────────

/** BD issue ID pattern for extraction */
const BD_ISSUE_ID_REGEX = /[a-z0-9]+-[a-z0-9]{4}/gi;

/**
 * Detect closed feature/task issues that have no corresponding documentation.
 *
 * For each closed bd issue of type 'feature' or 'task', checks if the issue ID
 * appears in any doc's content or frontmatter.
 */
export function detectCoverageGaps(
    docs: DocEntry[],
    bdIssues: BdIssue[],
    docContents: Map<string, string>,
): CrossCheckFinding[] {
    const findings: CrossCheckFinding[] = [];

    // Only check feature and task types that are closed
    const relevantIssues = bdIssues.filter(
        issue => issue.status === 'closed' && (issue.type === 'feature' || issue.type === 'task'),
    );

    if (relevantIssues.length === 0) return findings;

    // Build a set of all issue IDs mentioned across all docs
    const mentionedIds = new Set<string>();
    for (const doc of docs) {
        // Check frontmatter for issue references
        const fmStr = JSON.stringify(doc.frontmatter ?? {});
        for (const match of fmStr.matchAll(BD_ISSUE_ID_REGEX)) {
            mentionedIds.add(match[0].toLowerCase());
        }

        // Check doc content
        const content = docContents.get(doc.relativePath) ?? '';
        for (const match of content.matchAll(BD_ISSUE_ID_REGEX)) {
            mentionedIds.add(match[0].toLowerCase());
        }
    }

    // Find issues not mentioned in any doc
    for (const issue of relevantIssues) {
        const issueIdLower = issue.id.toLowerCase();
        if (!mentionedIds.has(issueIdLower)) {
            findings.push({
                severity: 'warning',
                kind: 'coverage-gap',
                docPath: '',
                message: `Feature issue ${issue.id} has no doc coverage`,
                detail: issue.title,
            });
        }
    }

    return findings;
}

// ── Reference validator ───────────────────────────────────────────────────────

/**
 * Validate that issue references in docs point to closed issues.
 *
 * Scans doc content for bd issue IDs and reports if referenced issues
 * are still open (potentially stale references).
 */
export function validateIssueReferences(
    docs: DocEntry[],
    bdIssues: BdIssue[],
    docContents: Map<string, string>,
): CrossCheckFinding[] {
    const findings: CrossCheckFinding[] = [];

    // Build a map of issue ID -> status
    const issueStatus = new Map<string, string>();
    for (const issue of bdIssues) {
        issueStatus.set(issue.id.toLowerCase(), issue.status);
    }

    for (const doc of docs) {
        const content = docContents.get(doc.relativePath) ?? '';
        const seenIds = new Set<string>();

        for (const match of content.matchAll(BD_ISSUE_ID_REGEX)) {
            const id = match[0].toLowerCase();
            if (seenIds.has(id)) continue; // Dedupe per doc
            seenIds.add(id);

            const status = issueStatus.get(id);
            if (status && status !== 'closed') {
                findings.push({
                    severity: 'info',
                    kind: 'ref-invalid',
                    docPath: doc.relativePath,
                    message: `References open issue ${id}`,
                });
            }
        }
    }

    return findings;
}

// ── Report builder ────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
};

/**
 * Build a CrossCheckResult from all findings.
 *
 * Sorts findings by severity (critical > warning > info).
 */
export function buildReport(
    findings: CrossCheckFinding[],
    docsChecked: number,
): CrossCheckResult {
    const sorted = [...findings].sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
    );

    return {
        docsChecked,
        findingsTotal: sorted.length,
        findings: sorted,
        generatedAt: new Date().toISOString(),
    };
}