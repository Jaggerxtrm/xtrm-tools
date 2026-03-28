import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import { spawnSync } from 'node:child_process';
import { t } from '../utils/theme.js';

interface EndOptions {
    draft: boolean;
    keep: boolean;
    yes: boolean;
    dryRun: boolean;
}

interface EndIssue {
    id: string;
    title: string;
    description: string;
    reason: string;
}

function git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

function bd(args: string[], cwd: string): { ok: boolean; out: string } {
    const r = spawnSync('bd', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

// Common conventional-commit scope words that are never beads IDs
const CONVENTIONAL_SCOPES = new Set([
    'feat', 'fix', 'chore', 'docs', 'test', 'tests', 'refactor', 'style',
    'perf', 'ci', 'build', 'revert', 'wip', 'auth', 'api', 'ui', 'db',
    'merge', 'memory', 'end', 'sync', 'core', 'cli', 'hooks', 'skills',
]);

/** Extract beads issue IDs from commit messages like "reason (xtrm-skg2)" or "reason (8jr5.8)" */
function extractIssueIds(commitLog: string): string[] {
    // Require at least one hyphen so single-word scopes like (auth) are excluded
    const matches = commitLog.matchAll(/\(([a-z][a-z0-9]*-[a-z0-9]+(?:\.[0-9]+)?)\)/gi);
    return [...new Set(
        [...matches]
            .map(m => m[1].toLowerCase())
            .filter(id => !CONVENTIONAL_SCOPES.has(id)),
    )];
}

function normalizePrTitle(input: string): string {
    const trimmed = input.trim().replace(/[.\s]+$/g, '');
    if (!trimmed) return 'Update worktree session';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function isGenericPrTitle(title: string): boolean {
    return /^(session changes|update|updates|misc|wip|work in progress)$/i.test(title.trim());
}

/** Infer a PR title from the commit log (first meaningful commit) with a file-based fallback. */
function inferTitleFromCommitsOrFiles(commitLog: string, changedFiles: string[]): string {
    // Try the first commit message subject line
    const firstCommit = commitLog.split('\n')[0]?.replace(/^[a-f0-9]+ /, '').trim() ?? '';
    if (firstCommit && !isGenericPrTitle(firstCommit)) {
        return normalizePrTitle(firstCommit);
    }

    // File-based fallback: derive from dominant changed area
    const hasCli = changedFiles.some(f => f.startsWith('cli/src/'));
    const hasTests = changedFiles.some(f => f.startsWith('cli/test/'));
    const hasHooks = changedFiles.some(f => f.startsWith('hooks/'));
    const hasSkills = changedFiles.some(f => f.startsWith('skills/'));
    const hasDocs = changedFiles.some(f => f.startsWith('docs/') || f === 'README.md' || f === 'XTRM-GUIDE.md');
    const hasConfig = changedFiles.some(f => f.startsWith('config/'));

    if (hasCli && hasTests) return 'Update CLI with tests';
    if (hasCli && hasHooks) return 'Update CLI and hooks';
    if (hasCli) return 'Update CLI';
    if (hasHooks) return 'Update hooks';
    if (hasSkills) return 'Update skills';
    if (hasDocs) return 'Update documentation';
    if (hasConfig) return 'Update config';

    return 'Update worktree session';
}

/** Generate PR title from issue data, with deterministic fallback if issue-derived titles are too generic. */
function buildPrTitle(issues: EndIssue[], changedFiles: string[], commitLog: string): string {
    if (issues.length === 0) return inferTitleFromCommitsOrFiles(commitLog, changedFiles);

    if (issues.length === 1) {
        const single = normalizePrTitle(issues[0].title || issues[0].reason || issues[0].id);
        return isGenericPrTitle(single) ? inferTitleFromCommitsOrFiles(commitLog, changedFiles) : single;
    }

    // Multiple issues: first issue title + count, fall back to commit/file inference
    const multi = normalizePrTitle(issues[0].title || issues[0].reason || issues[0].id);
    return isGenericPrTitle(multi)
        ? inferTitleFromCommitsOrFiles(commitLog, changedFiles)
        : `${multi} (+${issues.length - 1} more)`;
}

/** Generate PR body from issues, commit log, diff stat */
function buildPrBody(
    issues: Array<{ id: string; title: string; description: string; reason: string }>,
    commitLog: string,
    diffStat: string,
    branch: string,
): string {
    const lines: string[] = [];

    lines.push('## What');
    if (issues.length > 0) {
        for (const issue of issues) {
            lines.push(`- **${issue.id}**: ${issue.title}`);
            if (issue.description) lines.push(`  ${issue.description.split('\n')[0]}`);
        }
    } else {
        lines.push(`Session branch: \`${branch}\``);
    }

    if (issues.some(i => i.reason)) {
        lines.push('', '## Why');
        for (const issue of issues) {
            if (issue.reason) lines.push(`- ${issue.id}: ${issue.reason}`);
        }
    }

    if (commitLog) {
        lines.push('', '## Changes');
        const commits = commitLog.split('\n').slice(0, 20);
        lines.push(...commits.map(c => `- ${c}`));
        if (commitLog.split('\n').length > 20) lines.push('- *(and more...)*');
    }

    if (diffStat) {
        lines.push('', '## Files changed');
        lines.push('```');
        lines.push(diffStat);
        lines.push('```');
    }

    if (issues.length > 0) {
        lines.push('', `Closes: ${issues.map(i => i.id).join(' ')}`);
    }

    return lines.join('\n');
}

export function createEndCommand(): Command {
    return new Command('end')
        .description('Close session: rebase, push, open PR, link beads issues, clean up worktree')
        .option('--draft', 'Open PR as draft', false)
        .option('--keep', 'Keep worktree after PR creation (default: prompt)', false)
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--dry-run', 'Preview PR title, body, and linked issues without pushing or creating PR', false)
        .action(async (opts: EndOptions) => {
            const cwd = process.cwd();

            // 1. Gate: must be in an xt worktree (branch starts with xt/)
            const branchResult = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
            const branch = branchResult.out;

            if (!branch.startsWith('xt/')) {
                console.error(kleur.red(
                    `\n  ✗ Not in an xt worktree (current branch: ${branch})\n` +
                    `  xt end must be run from inside a worktree created by xt claude/pi\n`
                ));
                process.exit(1);
            }

            // 2. Gate: no uncommitted changes
            const statusResult = git(['status', '--porcelain'], cwd);
            if (statusResult.out.length > 0) {
                console.error(kleur.red(
                    '\n  ✗ Uncommitted changes detected. Commit or stash before running xt end.\n'
                ));
                console.error(kleur.dim(statusResult.out));
                process.exit(1);
            }

            console.log(t.bold(`\n  xt end — closing session on ${branch}\n`));

            // 3. Detect default branch (avoids hardcoding main vs master)
            let defaultBranch = 'main';
            const symRef = git(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], cwd);
            if (symRef.ok && symRef.out) {
                defaultBranch = symRef.out.replace('origin/', '');
            } else if (git(['rev-parse', '--verify', 'origin/master'], cwd).ok) {
                defaultBranch = 'master';
            }

            // 4. Collect closed issues from commit log
            const logResult = git(['log', `origin/${defaultBranch}..HEAD`, '--oneline'], cwd);
            const issueIds = extractIssueIds(logResult.out);

            const issues: EndIssue[] = [];
            for (const id of issueIds) {
                const queryResult = bd(['query', `id=${id}`, '--all', '--json'], cwd);
                if (queryResult.ok) {
                    try {
                        const data = JSON.parse(queryResult.out);
                        const first = Array.isArray(data) ? data[0] : data;
                        if (first) {
                            issues.push({
                                id,
                                title: first.title ?? id,
                                description: first.description ?? '',
                                reason: first.close_reason ?? '',
                            });
                            continue;
                        }
                    } catch {
                        // fall through to id-only record
                    }
                }
                issues.push({ id, title: id, description: '', reason: '' });
            }

            if (issues.length > 0) {
                console.log(t.success(`  ✓ Found ${issues.length} closed issue(s): ${issueIds.join(', ')}`));
            } else if (issueIds.length > 0) {
                console.log(kleur.yellow(`  ⚠ Found issue references in commits but could not load bead details: ${issueIds.join(', ')}`));
            } else {
                console.log(kleur.dim('  ○ No beads issues found in commit log'));
            }

            // 5. Dry-run: build PR preview from local state and exit before any destructive steps
            if (opts.dryRun) {
                const fullLog = git(['log', `origin/${defaultBranch}..HEAD`, '--oneline'], cwd).out;
                const diffStat = git(['diff', `origin/${defaultBranch}`, '--stat'], cwd).out;
                const changedFiles = git(['diff', `origin/${defaultBranch}`, '--name-only'], cwd).out.split('\n').filter(Boolean);
                const prTitle = buildPrTitle(issues, changedFiles, fullLog);
                const prBody = buildPrBody(issues, fullLog, diffStat, branch);

                console.log(t.bold('\n  [DRY RUN] PR preview\n'));
                console.log(`  ${kleur.bold('Title:')} ${prTitle}`);
                if (issues.length > 0) {
                    console.log(`  ${kleur.bold('Issues:')} ${issueIds.join(', ')}`);
                }
                console.log(`\n  ${kleur.bold('Body:')}`);
                for (const line of prBody.split('\n')) {
                    console.log(`  ${kleur.dim(line)}`);
                }
                console.log(t.accent('\n  [DRY RUN] No changes made — re-run without --dry-run to push and create PR\n'));
                return;
            }

            // 6. Fetch to ensure origin/<default> is current
            console.log(kleur.dim(`  Fetching origin/${defaultBranch}...`));
            git(['fetch', 'origin', defaultBranch], cwd);

            // 7. Rebase
            console.log(kleur.dim(`  Rebasing onto origin/${defaultBranch}...`));
            const rebaseResult = git(['rebase', `origin/${defaultBranch}`], cwd);
            if (!rebaseResult.ok) {
                const conflicts = git(['diff', '--name-only', '--diff-filter=U'], cwd).out;
                console.error(kleur.red('\n  ✗ Rebase conflicts detected:\n'));
                if (conflicts) {
                    for (const f of conflicts.split('\n')) console.error(kleur.yellow(`    ${f}`));
                }
                console.error(kleur.dim(
                    '\n  Resolve conflicts, then:\n' +
                    '    git add <files> && git rebase --continue\n' +
                    '  Then re-run: xt end\n'
                ));
                process.exit(1);
            }
            console.log(t.success(`  ✓ Rebased onto origin/${defaultBranch}`));

            // 8. Push (force-with-lease = safe after rebase)
            console.log(kleur.dim('  Pushing branch...'));
            const pushResult = git(['push', 'origin', branch, '--force-with-lease'], cwd);
            if (!pushResult.ok) {
                console.error(kleur.red(`\n  ✗ Push failed:\n  ${pushResult.err}\n`));
                process.exit(1);
            }
            console.log(t.success(`  ✓ Pushed ${branch}`));

            // 9. Build PR content
            const fullLog = git(['log', `origin/${defaultBranch}..HEAD`, '--oneline'], cwd).out;
            const diffStat = git(['diff', `origin/${defaultBranch}`, '--stat'], cwd).out;
            const changedFiles = git(['diff', `origin/${defaultBranch}`, '--name-only'], cwd).out.split('\n').filter(Boolean);
            const prTitle = buildPrTitle(issues, changedFiles, fullLog);
            const prBody = buildPrBody(issues, fullLog, diffStat, branch);

            // 10. Create PR
            console.log(kleur.dim('  Creating PR...'));
            const prArgs = ['pr', 'create', '--title', prTitle, '--body', prBody];
            if (opts.draft) prArgs.push('--draft');

            const prResult = spawnSync('gh', prArgs, { cwd, encoding: 'utf8', stdio: 'pipe' });
            if (prResult.status !== 0) {
                console.error(kleur.red(`\n  ✗ PR creation failed:\n  ${prResult.stderr?.trim()}\n`));
                process.exit(1);
            }
            const prUrl = prResult.stdout.trim();
            console.log(t.success(`  ✓ PR created: ${prUrl}`));

            // 11. Beads linkage: add PR URL to each closed issue's notes
            for (const issue of issues) {
                bd(['update', issue.id, '--notes', `PR: ${prUrl}`], cwd);
            }
            if (issues.length > 0) {
                console.log(t.success(`  ✓ Linked PR to ${issues.length} issue(s)`));
            }

            // 12. Worktree cleanup
            if (!opts.keep) {
                let doRemove = opts.yes;
                if (!opts.yes) {
                    const { remove } = await prompts({
                        type: 'confirm',
                        name: 'remove',
                        message: `Remove local worktree at ${cwd}?`,
                        initial: false,
                    });
                    doRemove = remove;
                }

                if (doRemove) {
                    // Must run from outside the worktree
                    try {
                        const repoRoot = git(['rev-parse', '--show-toplevel'], cwd).out;
                        const removeResult = spawnSync(
                            'git', ['worktree', 'remove', cwd, '--force'],
                            { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' }
                        );
                        if (removeResult.status === 0) {
                            console.log(t.success('  ✓ Worktree removed'));
                        } else {
                            console.log(kleur.yellow('  ⚠ Could not remove worktree — remove manually:'));
                            console.log(kleur.dim(`    git worktree remove ${cwd} --force`));
                        }
                    } catch {
                        console.log(kleur.yellow('  ⚠ Could not remove worktree automatically'));
                    }
                }
            }

            console.log(t.boldGreen('\n  ✓ Session closed\n'));
            console.log(kleur.dim(`  PR: ${prUrl}`));
            console.log(kleur.dim('  Merge: review and merge when CI is green\n'));
        });
}
