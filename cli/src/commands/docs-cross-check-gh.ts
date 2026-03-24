import kleur from 'kleur';
import { spawnSync } from 'node:child_process';
import type { GhPr, GhIssue } from './docs-cross-check-types.js';

export function isGhAvailable(): boolean {
    return spawnSync('gh', ['--version'], { stdio: 'pipe', encoding: 'utf8' }).status === 0;
}

export function fetchRecentPrs(repoRoot: string, days: number): GhPr[] {
    if (!isGhAvailable()) {
        console.log(kleur.yellow('  ⚠ gh CLI not found — skipping PR data (install gh to enable cross-check)'));
        return [];
    }

    const r = spawnSync('gh', [
        'pr', 'list',
        '--state', 'merged',
        '--limit', '100',
        '--json', 'number,title,mergedAt,url,headRefName',
    ], { stdio: 'pipe', encoding: 'utf8', cwd: repoRoot });

    if (r.status === 4) {
        console.log(kleur.yellow('  ⚠ gh auth error — run: gh auth login'));
        return [];
    }
    if (r.status !== 0) {
        console.log(kleur.yellow(`  ⚠ gh pr list failed (exit ${r.status}) — skipping PR data`));
        return [];
    }

    let prs: GhPr[];
    try {
        prs = JSON.parse(r.stdout) as GhPr[];
    } catch {
        console.log(kleur.yellow('  ⚠ Failed to parse gh pr list output — skipping PR data'));
        return [];
    }

    const cutoff = Date.now() - days * 86_400_000;
    return prs.filter(pr => pr.mergedAt && new Date(pr.mergedAt).getTime() >= cutoff);
}

export function fetchRecentIssues(repoRoot: string, days: number): GhIssue[] {
    if (!isGhAvailable()) return [];

    const r = spawnSync('gh', [
        'issue', 'list',
        '--state', 'closed',
        '--limit', '100',
        '--json', 'number,title,closedAt,url,labels',
    ], { stdio: 'pipe', encoding: 'utf8', cwd: repoRoot });

    if (r.status === 4) {
        console.log(kleur.yellow('  ⚠ gh auth error — run: gh auth login'));
        return [];
    }
    if (r.status !== 0) {
        console.log(kleur.yellow(`  ⚠ gh issue list failed (exit ${r.status}) — skipping issue data`));
        return [];
    }

    let issues: GhIssue[];
    try {
        issues = JSON.parse(r.stdout) as GhIssue[];
        // gh returns labels as objects — normalise to strings
        issues = issues.map(i => ({
            ...i,
            labels: i.labels.map((l: any) => (typeof l === 'string' ? l : l.name ?? '')),
        }));
    } catch {
        console.log(kleur.yellow('  ⚠ Failed to parse gh issue list output — skipping issue data'));
        return [];
    }

    const cutoff = Date.now() - days * 86_400_000;
    return issues.filter(i => i.closedAt && new Date(i.closedAt).getTime() >= cutoff);
}
