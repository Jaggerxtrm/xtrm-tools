import { spawnSync } from 'node:child_process';
import kleur from 'kleur';
import type { GhPr, GhIssue } from './docs-cross-check-types.js';

// ── gh CLI availability ───────────────────────────────────────────────────────

let _ghAvailable: boolean | null = null;

/**
 * Check if the GitHub CLI is installed and available.
 * Caches result after first check.
 */
export function isGhAvailable(): boolean {
    if (_ghAvailable !== null) return _ghAvailable;
    const r = spawnSync('gh', ['--version'], { stdio: 'pipe' });
    _ghAvailable = r.status === 0;
    return _ghAvailable;
}

// ── Error handling helpers ────────────────────────────────────────────────────

function logGhWarning(message: string): void {
    console.error(kleur.yellow(`[gh] ${message}`));
}

function handleGhError(context: string, result: { status: number | null; stderr?: string }): void {
    if (result.status === 4) {
        logGhWarning(`${context}: Authentication failed. Run 'gh auth login' first.`);
    } else if (result.status !== 0) {
        const hint = result.stderr?.trim() || `exit code ${result.status}`;
        logGhWarning(`${context}: gh CLI failed (${hint})`);
    }
}

// ── PR fetcher ────────────────────────────────────────────────────────────────

/**
 * Fetch recently merged PRs from GitHub.
 * Returns empty array on any gh failure (graceful degradation).
 *
 * @param repoRoot - Path to the git repository root
 * @param days - Number of days to look back
 * @returns Array of GhPr objects (empty if gh unavailable or on error)
 */
export function fetchRecentPrs(repoRoot: string, days: number): GhPr[] {
    if (!isGhAvailable()) {
        logGhWarning('fetchRecentPrs: gh CLI not available, skipping PR fetch');
        return [];
    }

    const r = spawnSync('gh', [
        'pr', 'list',
        '--state', 'merged',
        '--limit', '100',
        '--json', 'number,title,mergedAt,url,headRefName',
    ], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
    });

    if (r.status !== 0) {
        handleGhError('fetchRecentPrs', r);
        return [];
    }

    try {
        const data = JSON.parse(r.stdout ?? '[]') as Array<{
            number: number;
            title: string;
            mergedAt: string | null;
            url: string;
            headRefName: string;
        }>;

        // Filter to within the days window
        const cutoff = new Date(Date.now() - days * 86400000);
        return data.filter(pr => {
            if (!pr.mergedAt) return false;
            return new Date(pr.mergedAt) >= cutoff;
        });
    } catch (e) {
        logGhWarning(`fetchRecentPrs: JSON parse failed (${e instanceof Error ? e.message : 'unknown error'})`);
        return [];
    }
}

// ── Issue fetcher ─────────────────────────────────────────────────────────────

/**
 * Fetch recently closed issues from GitHub.
 * Returns empty array on any gh failure (graceful degradation).
 *
 * @param repoRoot - Path to the git repository root
 * @param days - Number of days to look back
 * @returns Array of GhIssue objects (empty if gh unavailable or on error)
 */
export function fetchRecentIssues(repoRoot: string, days: number): GhIssue[] {
    if (!isGhAvailable()) {
        logGhWarning('fetchRecentIssues: gh CLI not available, skipping issue fetch');
        return [];
    }

    const r = spawnSync('gh', [
        'issue', 'list',
        '--state', 'closed',
        '--limit', '100',
        '--json', 'number,title,closedAt,url,labels',
    ], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
    });

    if (r.status !== 0) {
        handleGhError('fetchRecentIssues', r);
        return [];
    }

    try {
        const data = JSON.parse(r.stdout ?? '[]') as Array<{
            number: number;
            title: string;
            closedAt: string | null;
            url: string;
            labels: Array<{ name: string }>;
        }>;

        // Filter to within the days window and normalize labels
        const cutoff = new Date(Date.now() - days * 86400000);
        return data
            .filter(issue => {
                if (!issue.closedAt) return false;
                return new Date(issue.closedAt) >= cutoff;
            })
            .map(issue => ({
                number: issue.number,
                title: issue.title,
                closedAt: issue.closedAt,
                url: issue.url,
                labels: issue.labels.map(l => l.name),
            }));
    } catch (e) {
        logGhWarning(`fetchRecentIssues: JSON parse failed (${e instanceof Error ? e.message : 'unknown error'})`);
        return [];
    }
}