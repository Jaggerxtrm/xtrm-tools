import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import { spawnSync, execSync } from 'node:child_process';
import { t } from '../utils/theme.js';

interface EndOptions {
    draft: boolean;
    keep: boolean;
    yes: boolean;
}

function git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

function bd(args: string[], cwd: string): { ok: boolean; out: string } {
    const r = spawnSync('bd', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

/** Extract issue IDs from commit messages like "reason (jaggers-agent-tools-xxxx)" */
function extractIssueIds(commitLog: string): string[] {
    const matches = commitLog.matchAll(/\(([a-z0-9]+-[a-z0-9]+-[a-z0-9]+)\)/g);
    return [...new Set([...matches].map(m => m[1]))];
}

/** Generate PR title from issue data */
function buildPrTitle(issues: Array<{ id: string; reason: string; title: string }>): string {
    if (issues.length === 0) return 'session changes';
    if (issues.length === 1) return issues[0].reason || issues[0].title;
    return `${issues[0].reason || issues[0].title} (+${issues.length - 1} more)`;
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

            const issues: Array<{ id: string; title: string; description: string; reason: string }> = [];
            for (const id of issueIds) {
                const showResult = bd(['show', id, '--json'], cwd);
                if (showResult.ok) {
                    try {
                        const data = JSON.parse(showResult.out);
                        issues.push({
                            id,
                            title: data.title ?? id,
                            description: data.description ?? '',
                            reason: data.close_reason ?? '',
                        });
                    } catch {
                        issues.push({ id, title: id, description: '', reason: '' });
                    }
                }
            }

            if (issues.length > 0) {
                console.log(t.success(`  ✓ Found ${issues.length} closed issue(s): ${issueIds.join(', ')}`));
            } else {
                console.log(kleur.dim('  ○ No beads issues found in commit log'));
            }

            // 5. Fetch to ensure origin/<default> is current
            console.log(kleur.dim(`  Fetching origin/${defaultBranch}...`));
            git(['fetch', 'origin', defaultBranch], cwd);

            // 6. Rebase
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

            // 6. Push (force-with-lease = safe after rebase)
            console.log(kleur.dim('  Pushing branch...'));
            const pushResult = git(['push', 'origin', branch, '--force-with-lease'], cwd);
            if (!pushResult.ok) {
                console.error(kleur.red(`\n  ✗ Push failed:\n  ${pushResult.err}\n`));
                process.exit(1);
            }
            console.log(t.success(`  ✓ Pushed ${branch}`));

            // 7. Build PR content
            const fullLog = git(['log', `origin/${defaultBranch}..HEAD`, '--oneline'], cwd).out;
            const diffStat = git(['diff', `origin/${defaultBranch}`, '--stat'], cwd).out;
            const prTitle = buildPrTitle(issues);
            const prBody = buildPrBody(issues, fullLog, diffStat, branch);

            // 8. Create PR
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

            // 9. Beads linkage: add PR URL to each closed issue's notes
            for (const issue of issues) {
                bd(['update', issue.id, '--notes', `PR: ${prUrl}`], cwd);
            }
            if (issues.length > 0) {
                console.log(t.success(`  ✓ Linked PR to ${issues.length} issue(s)`));
            }

            // 10. Worktree cleanup
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
