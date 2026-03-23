import { spawnSync } from 'node:child_process';
import kleur from 'kleur';
import type { BdIssue } from './docs-cross-check-types.js';

// ── bd CLI availability ───────────────────────────────────────────────────────

let _bdAvailable: boolean | null = null;

/**
 * Check if the bd CLI is installed and available.
 * Caches result after first check.
 */
export function isBdAvailable(): boolean {
    if (_bdAvailable !== null) return _bdAvailable;
    const r = spawnSync('bd', ['--version'], { stdio: 'pipe', encoding: 'utf8' });
    _bdAvailable = r.status === 0;
    return _bdAvailable;
}

// ── Error handling helpers ────────────────────────────────────────────────────

function logBdWarning(message: string): void {
    console.error(kleur.yellow(`[bd] ${message}`));
}

// ── Issue fetcher ─────────────────────────────────────────────────────────────

interface BdIssueJson {
    id: string;
    title: string;
    status: string;
    issue_type: string;
    closed_at: string | null;
}

/**
 * Fetch recently closed issues from bd (beads).
 * Returns empty array on any bd failure (graceful degradation).
 *
 * @param days - Number of days to look back for recently closed issues
 * @returns Array of BdIssue objects (empty if bd unavailable or on error)
 */
export function fetchClosedBdIssues(days: number): BdIssue[] {
    if (!isBdAvailable()) {
        logBdWarning('fetchClosedBdIssues: bd CLI not available, skipping issue fetch');
        return [];
    }

    // Use bd query with relative date expression
    const r = spawnSync('bd', [
        'query',
        `status=closed AND updated>${days}d`,
        '--json',
    ], {
        encoding: 'utf8',
        stdio: 'pipe',
    });

    if (r.status !== 0) {
        const hint = r.stderr?.trim() || `exit code ${r.status}`;
        logBdWarning(`fetchClosedBdIssues: bd query failed (${hint})`);
        return [];
    }

    try {
        const data = JSON.parse(r.stdout ?? '[]') as BdIssueJson[];

        // Map to BdIssue shape (normalize field names)
        return data.map(issue => ({
            id: issue.id,
            title: issue.title,
            status: issue.status,
            type: issue.issue_type,
            closedAt: issue.closed_at,
        }));
    } catch (e) {
        logBdWarning(`fetchClosedBdIssues: JSON parse failed (${e instanceof Error ? e.message : 'unknown error'})`);
        return [];
    }
}