import { Command } from 'commander';
import kleur from 'kleur';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { t } from '../utils/theme.js';

function run(cmd: string, args: string[], cwd: string): { ok: boolean; out: string } {
    const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

function detectDefaultBranch(cwd: string): string {
    const symRef = run('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], cwd);
    if (symRef.ok && symRef.out) return symRef.out.replace('origin/', '');
    if (run('git', ['rev-parse', '--verify', 'origin/master'], cwd).ok) return 'master';
    return 'main';
}

function getSessionHash(cwd: string): string {
    const r = run('git', ['rev-parse', '--short', 'HEAD'], cwd);
    return r.ok ? r.out : Date.now().toString(36);
}

interface ClosedIssue {
    id: string;
    title: string;
    type: string;
    priority: string;
    close_reason: string;
}

interface OpenIssue {
    id: string;
    title: string;
    type: string;
    priority: string;
    status: string;
}

function extractIssueIds(commitLog: string): string[] {
    const CONVENTIONAL_SCOPES = new Set([
        'feat', 'fix', 'chore', 'docs', 'test', 'tests', 'refactor', 'style',
        'perf', 'ci', 'build', 'revert', 'wip', 'auth', 'api', 'ui', 'db',
        'merge', 'memory', 'end', 'sync', 'core', 'cli', 'hooks', 'skills',
    ]);
    const matches = commitLog.matchAll(/\(([a-z][a-z0-9]*-[a-z0-9]+(?:\.[0-9]+)?)\)/gi);
    return [...new Set(
        [...matches]
            .map(m => m[1].toLowerCase())
            .filter(id => !CONVENTIONAL_SCOPES.has(id)),
    )];
}

function queryIssue(id: string, cwd: string): Record<string, string> | null {
    const r = run('bd', ['query', `id=${id}`, '--all', '--json'], cwd);
    if (!r.ok) return null;
    try {
        const data = JSON.parse(r.out);
        return Array.isArray(data) ? data[0] : data;
    } catch {
        return null;
    }
}

function collectClosedIssues(commitLog: string, cwd: string): ClosedIssue[] {
    const ids = extractIssueIds(commitLog);
    const issues: ClosedIssue[] = [];
    for (const id of ids) {
        const data = queryIssue(id, cwd);
        issues.push({
            id,
            title: data?.title ?? id,
            type: data?.issue_type ?? data?.type ?? 'task',
            priority: String(data?.priority ?? '?'),
            close_reason: data?.close_reason ?? '',
        });
    }
    return issues;
}

function collectOpenIssues(cwd: string): OpenIssue[] {
    // Use bd query --json for structured output (bd list doesn't support --json)
    const issues: OpenIssue[] = [];
    for (const status of ['in_progress', 'open']) {
        const r = run('bd', ['query', `status=${status}`, '--json'], cwd);
        if (!r.ok) continue;
        try {
            const items = JSON.parse(r.out);
            if (!Array.isArray(items)) continue;
            for (const item of items) {
                issues.push({
                    id: item.id ?? '?',
                    title: item.title ?? '',
                    type: item.issue_type ?? item.type ?? 'task',
                    priority: String(item.priority ?? '?'),
                    status,
                });
            }
        } catch { /* skip parse errors */ }
    }
    return issues;
}

interface SpecialistJob {
    name: string;
    status: string;
    specialist: string;
    duration: string;
}

function collectSpecialistJobs(cwd: string): SpecialistJob[] {
    const jobsDir = path.join(cwd, '.specialists', 'jobs');
    if (!fs.pathExistsSync(jobsDir)) return [];

    const jobs: SpecialistJob[] = [];
    try {
        const dirs = fs.readdirSync(jobsDir).filter(d =>
            fs.statSync(path.join(jobsDir, d)).isDirectory()
        );
        for (const dir of dirs) {
            const statusFile = path.join(jobsDir, dir, 'status.json');
            if (!fs.pathExistsSync(statusFile)) continue;
            try {
                const data = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
                jobs.push({
                    name: dir,
                    status: data.status ?? 'unknown',
                    specialist: data.specialist_name ?? data.specialist ?? 'unknown',
                    duration: data.duration_ms ? `${(data.duration_ms / 1000).toFixed(1)}s` : '?',
                });
            } catch { /* skip bad files */ }
        }
    } catch { /* jobs dir unreadable */ }
    return jobs;
}

function collectMemories(cwd: string): Array<{ key: string; content: string }> {
    // bd memories with no keyword returns recent — grab all
    const r = run('bd', ['memories'], cwd);
    if (!r.ok || !r.out) return [];

    const memories: Array<{ key: string; content: string }> = [];
    const lines = r.out.split('\n');
    for (const line of lines) {
        // Format: "key: content" or "### key\ncontent"
        const match = line.match(/^### (.+)/) || line.match(/^([a-z0-9_-]+):\s+(.+)/i);
        if (match) {
            memories.push({ key: match[1], content: match[2] ?? '' });
        }
    }
    return memories;
}

function buildSkeleton(opts: {
    date: string;
    branch: string;
    defaultBranch: string;
    commitLog: string;
    commitCount: number;
    closedIssues: ClosedIssue[];
    openIssues: OpenIssue[];
    newFiles: string[];
    modifiedFiles: string[];
    deletedFiles: string[];
    diffStat: string;
    specialistJobs: SpecialistJob[];
    memories: Array<{ key: string; content: string }>;
}): string {
    const lines: string[] = [];

    // Frontmatter
    lines.push('---');
    lines.push(`session_date: ${opts.date}`);
    lines.push(`branch: ${opts.branch}`);
    lines.push(`commits: ${opts.commitCount}`);
    lines.push(`issues_closed: ${opts.closedIssues.length}`);
    lines.push(`issues_filed: 0`);
    lines.push(`specialist_dispatches: ${opts.specialistJobs.length}`);
    lines.push(`models_used: []`);
    lines.push('---');
    lines.push('');

    // Title
    lines.push(`# Session Report — ${opts.date}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push('<!-- FILL: What was accomplished this session. Key decisions, discoveries, outcomes. Technical prose, no fluff. -->');
    lines.push('');

    // Issues Closed
    lines.push(`## Issues Closed (${opts.closedIssues.length})`);
    lines.push('');
    if (opts.closedIssues.length > 0) {
        lines.push('| ID | Title | Type | Close Reason |');
        lines.push('|----|-------|------|-------------|');
        for (const issue of opts.closedIssues) {
            const reason = issue.close_reason.split('\n')[0] || '';
            lines.push(`| ${issue.id} | ${issue.title} | ${issue.type} | ${reason} |`);
        }
        lines.push('');
        lines.push('<!-- FILL: Group rows by category (backlog, bugs discovered, cleanup, features). Add Specialist and Wave columns if specialists were dispatched. Add context to close reasons where the raw reason is terse. -->');
    } else {
        lines.push('*No issues closed via commit references.*');
        lines.push('');
        lines.push('<!-- FILL: If issues were closed outside commit messages, add them here with full context. -->');
    }
    lines.push('');

    // Issues Filed
    lines.push('## Issues Filed');
    lines.push('');
    lines.push('| ID | P | Type | Title | Why |');
    lines.push('|----|---|------|-------|-----|');
    lines.push('<!-- FILL: List every issue created this session. The Why column is critical — explain the rationale for filing, not just the title. -->');
    lines.push('');

    // Specialist Dispatches
    lines.push('## Specialist Dispatches');
    lines.push('');
    if (opts.specialistJobs.length > 0) {
        lines.push('### Jobs');
        lines.push('');
        lines.push('| Job | Specialist | Status | Duration |');
        lines.push('|-----|-----------|--------|----------|');
        for (const job of opts.specialistJobs) {
            lines.push(`| ${job.name} | ${job.specialist} | ${job.status} | ${job.duration} |`);
        }
        lines.push('');
        lines.push('<!-- FILL: Organize into Wave summary table with models and outcomes. Add Problems Encountered sub-table if any dispatches failed or had issues. -->');
    } else {
        lines.push('*No specialist dispatches detected.*');
        lines.push('');
        lines.push('<!-- FILL: If specialists were used via MCP tools (not CLI), document dispatches here with wave/model/outcome details. -->');
    }
    lines.push('');

    // Problems Encountered
    lines.push('## Problems Encountered');
    lines.push('');
    lines.push('| Problem | Root Cause | Resolution |');
    lines.push('|---------|-----------|------------|');
    lines.push('<!-- FILL: Every problem hit during the session — bugs discovered, blockers, failed approaches. Root cause and resolution are mandatory columns. If no problems, delete this section. -->');
    lines.push('');

    // Code Changes
    lines.push('## Code Changes');
    lines.push('');
    if (opts.newFiles.length > 0) {
        lines.push('### New files');
        for (const f of opts.newFiles) lines.push(`- \`${f}\``);
        lines.push('');
    }
    if (opts.modifiedFiles.length > 0) {
        lines.push('### Modified files');
        for (const f of opts.modifiedFiles) lines.push(`- \`${f}\``);
        lines.push('');
    }
    if (opts.deletedFiles.length > 0) {
        lines.push('### Deleted files');
        for (const f of opts.deletedFiles) lines.push(`- \`${f}\``);
        lines.push('');
    }
    if (opts.diffStat) {
        lines.push('### Diff stats');
        lines.push('```');
        lines.push(opts.diffStat);
        lines.push('```');
        lines.push('');
    }
    lines.push('<!-- FILL: Narrative explaining key modifications — what changed and why. Group logically if many files. -->');
    lines.push('');

    // Documentation Updates
    lines.push('## Documentation Updates');
    lines.push('');
    lines.push('<!-- FILL: Any doc changes, memory updates, skill modifications, CHANGELOG entries. Delete if none. -->');
    lines.push('');

    // Open Issues with Context
    lines.push(`## Open Issues with Context`);
    lines.push('');
    if (opts.openIssues.length > 0) {
        lines.push('| ID | P | Title | Status | Context / Suggestions |');
        lines.push('|----|---|-------|--------|----------------------|');
        for (const issue of opts.openIssues) {
            lines.push(`| ${issue.id} | P${issue.priority} | ${issue.title} | ${issue.status} | <!-- FILL --> |`);
        }
        lines.push('');
        lines.push('<!-- FILL: The Context / Suggestions column is the most valuable part of the handoff. For each issue, write what the next agent needs to know: current state, blockers discovered, suggested approach, files to look at. Group into Ready / Backlog subsections if useful. -->');
    } else {
        lines.push('*No open issues.*');
    }
    lines.push('');

    // Memories Saved
    lines.push('## Memories Saved');
    lines.push('');
    lines.push('| Key | Content |');
    lines.push('|-----|---------|');
    if (opts.memories.length > 0) {
        for (const m of opts.memories) {
            lines.push(`| ${m.key} | ${m.content} |`);
        }
    }
    lines.push('<!-- FILL: List all memories saved this session via bd remember. If the skeleton missed any, add them. -->');
    lines.push('');

    // Suggested Next Priority
    lines.push('## Suggested Next Priority');
    lines.push('');
    lines.push('<!-- FILL: Ordered list (1-4 items) with rationale for each. Based on what you learned this session — dependency order, user intent, blocked items about to unblock. -->');
    lines.push('');

    return lines.join('\n');
}

async function generateReport(cwd: string): Promise<string> {
    const defaultBranch = detectDefaultBranch(cwd);
    const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd).out || 'unknown';
    const sessionHash = getSessionHash(cwd);
    const date = new Date().toISOString().slice(0, 10);

    // Determine commit range base
    // If on a feature branch, compare to default branch. If on default branch, use last 24h or last tag.
    const isOnDefault = branch === defaultBranch;
    const rangeBase = isOnDefault
        ? run('git', ['log', '--since=24 hours ago', '--format=%H', '--reverse'], cwd).out.split('\n')[0] || 'HEAD~10'
        : `origin/${defaultBranch}`;
    const range = isOnDefault ? `${rangeBase}..HEAD` : `origin/${defaultBranch}..HEAD`;

    // Git data
    const commitLog = run('git', ['log', range, '--oneline'], cwd).out;
    const commitCount = commitLog ? commitLog.split('\n').filter(Boolean).length : 0;
    const newFiles = run('git', ['diff', range, '--name-only', '--diff-filter=A'], cwd).out.split('\n').filter(Boolean);
    const modifiedFiles = run('git', ['diff', range, '--name-only', '--diff-filter=M'], cwd).out.split('\n').filter(Boolean);
    const deletedFiles = run('git', ['diff', range, '--name-only', '--diff-filter=D'], cwd).out.split('\n').filter(Boolean);
    const diffStat = run('git', ['diff', range, '--stat'], cwd).out;

    // Beads data
    const closedIssues = collectClosedIssues(commitLog, cwd);
    const openIssues = collectOpenIssues(cwd);

    // Specialist data
    const specialistJobs = collectSpecialistJobs(cwd);

    // Memories
    const memories = collectMemories(cwd);

    // Build skeleton
    const skeleton = buildSkeleton({
        date,
        branch,
        defaultBranch,
        commitLog,
        commitCount,
        closedIssues,
        openIssues,
        newFiles,
        modifiedFiles,
        deletedFiles,
        diffStat,
        specialistJobs,
        memories,
    });

    // Write to .xtrm/reports/
    const reportsDir = path.join(cwd, '.xtrm', 'reports');
    await fs.ensureDir(reportsDir);
    const filename = `${date}-${sessionHash}.md`;
    const filePath = path.join(reportsDir, filename);
    await fs.writeFile(filePath, skeleton, 'utf8');

    return filePath;
}

async function showReport(cwd: string, target?: string): Promise<void> {
    const reportsDir = path.join(cwd, '.xtrm', 'reports');
    if (!await fs.pathExists(reportsDir)) {
        console.error(kleur.red('\n  No reports found at .xtrm/reports/\n'));
        process.exit(1);
    }

    let filePath: string;
    if (target) {
        // Try exact path, then match in reports dir
        if (await fs.pathExists(target)) {
            filePath = target;
        } else {
            const candidate = path.join(reportsDir, target.endsWith('.md') ? target : `${target}.md`);
            if (await fs.pathExists(candidate)) {
                filePath = candidate;
            } else {
                // Fuzzy match
                const files = (await fs.readdir(reportsDir)).filter(f => f.endsWith('.md') && f.includes(target));
                if (files.length === 0) {
                    console.error(kleur.red(`\n  No report matching "${target}"\n`));
                    process.exit(1);
                }
                filePath = path.join(reportsDir, files[files.length - 1]);
            }
        }
    } else {
        // Latest report
        const files = (await fs.readdir(reportsDir)).filter(f => f.endsWith('.md')).sort();
        if (files.length === 0) {
            console.error(kleur.red('\n  No reports found\n'));
            process.exit(1);
        }
        filePath = path.join(reportsDir, files[files.length - 1]);
    }

    const content = await fs.readFile(filePath, 'utf8');
    const rel = path.relative(cwd, filePath);
    console.log(kleur.dim(`\n  ${rel}\n`));
    console.log(content);
}

async function listReports(cwd: string): Promise<void> {
    const reportsDir = path.join(cwd, '.xtrm', 'reports');
    if (!await fs.pathExists(reportsDir)) {
        console.log(kleur.dim('\n  No reports directory at .xtrm/reports/\n'));
        return;
    }

    const files = (await fs.readdir(reportsDir)).filter(f => f.endsWith('.md')).sort();
    if (files.length === 0) {
        console.log(kleur.dim('\n  No reports found\n'));
        return;
    }

    console.log(t.bold(`\n  Session Reports (${files.length})\n`));
    for (const file of files) {
        const filePath = path.join(reportsDir, file);
        const content = await fs.readFile(filePath, 'utf8');

        // Parse frontmatter for summary line
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        let summary = '';
        if (fmMatch) {
            const fm = fmMatch[1];
            const commits = fm.match(/commits:\s*(\d+)/)?.[1] ?? '?';
            const closed = fm.match(/issues_closed:\s*(\d+)/)?.[1] ?? '?';
            const filed = fm.match(/issues_filed:\s*(\d+)/)?.[1] ?? '?';
            const dispatches = fm.match(/specialist_dispatches:\s*(\d+)/)?.[1] ?? '0';
            summary = kleur.dim(` commits:${commits} closed:${closed} filed:${filed} specialists:${dispatches}`);
        }

        console.log(`  ${kleur.white(file)}${summary}`);
    }
    console.log('');
}

async function diffReports(cwd: string, a: string, b: string): Promise<void> {
    const reportsDir = path.join(cwd, '.xtrm', 'reports');

    const resolve = async (ref: string): Promise<string> => {
        if (await fs.pathExists(ref)) return ref;
        const candidate = path.join(reportsDir, ref.endsWith('.md') ? ref : `${ref}.md`);
        if (await fs.pathExists(candidate)) return candidate;
        const files = (await fs.readdir(reportsDir)).filter(f => f.endsWith('.md') && f.includes(ref));
        if (files.length > 0) return path.join(reportsDir, files[files.length - 1]);
        console.error(kleur.red(`  No report matching "${ref}"`));
        process.exit(1);
    };

    const pathA = await resolve(a);
    const pathB = await resolve(b);

    const result = run('diff', ['--unified=3', '--color=always', pathA, pathB], cwd);
    if (!result.out) {
        console.log(kleur.dim('\n  Reports are identical\n'));
        return;
    }
    console.log(result.out);
}

export function createReportCommand(): Command {
    const cmd = new Command('report')
        .description('Session close reports — structured technical handoffs');

    cmd.command('generate')
        .description('Collect session data and generate a skeleton report at .xtrm/reports/')
        .action(async () => {
            const cwd = process.cwd();
            console.log(kleur.dim('\n  Collecting session data...'));
            const filePath = await generateReport(cwd);
            const rel = path.relative(cwd, filePath);
            console.log(t.success(`\n  Generated: ${rel}`));
            console.log(kleur.dim('  Fill <!-- FILL --> sections with session insights, then commit.\n'));
        });

    cmd.command('show [target]')
        .description('Display a report (default: latest)')
        .action(async (target?: string) => {
            await showReport(process.cwd(), target);
        });

    cmd.command('list')
        .description('List all session reports')
        .action(async () => {
            await listReports(process.cwd());
        });

    cmd.command('diff <a> <b>')
        .description('Compare two reports')
        .action(async (a: string, b: string) => {
            await diffReports(process.cwd(), a, b);
        });

    // Default: show help
    cmd.action(() => cmd.help());

    return cmd;
}
