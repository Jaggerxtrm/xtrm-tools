import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import { spawnSync } from 'node:child_process';
import { t } from '../utils/theme.js';

interface WorktreeInfo {
    path: string;
    branch: string;
    head: string;
    prunable: boolean;
}

/** Parse `git worktree list --porcelain` output into WorktreeInfo array */
function listXtWorktrees(repoRoot: string): WorktreeInfo[] {
    const r = spawnSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe',
    });
    if (r.status !== 0) return [];

    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of (r.stdout ?? '').split('\n')) {
        if (line.startsWith('worktree ')) {
            if (current.path && current.branch?.startsWith('refs/heads/xt/')) {
                worktrees.push(current as WorktreeInfo);
            }
            current = { path: line.slice('worktree '.length), prunable: false };
        } else if (line.startsWith('HEAD ')) {
            current.head = line.slice('HEAD '.length);
        } else if (line.startsWith('branch ')) {
            current.branch = line.slice('branch '.length);
        } else if (line === 'prunable') {
            current.prunable = true;
        }
    }
    // Flush last entry
    if (current.path && current.branch?.startsWith('refs/heads/xt/')) {
        worktrees.push(current as WorktreeInfo);
    }

    return worktrees;
}

/** Check if a branch has been merged into main */
function isMergedIntoMain(branch: string, repoRoot: string): boolean {
    const branchShort = branch.replace('refs/heads/', '');
    const r = spawnSync('git', ['branch', '--merged', 'origin/main', '--list', branchShort], {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe',
    });
    return (r.stdout ?? '').includes(branchShort);
}

/** Check if a branch has an open or merged PR */
function getPrStatus(branch: string, repoRoot: string): string {
    const branchShort = branch.replace('refs/heads/', '');
    const r = spawnSync('gh', ['pr', 'list', '--head', branchShort, '--state', 'all', '--json', 'state,url', '--limit', '1'], {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe',
    });
    if (r.status !== 0) return 'unknown';
    try {
        const data = JSON.parse(r.stdout ?? '[]');
        if (data.length === 0) return 'no PR';
        return `${data[0].state.toLowerCase()} (${data[0].url})`;
    } catch {
        return 'unknown';
    }
}

function getRepoRoot(cwd: string): string {
    const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: 'pipe' });
    return r.ok ? r.stdout.trim() : cwd;
}

export function createWorktreeCommand(): Command {
    const cmd = new Command('worktree')
        .description('Manage xt session worktrees');

    cmd.command('list')
        .description('List all active xt/* worktrees with status')
        .action(async () => {
            const repoRoot = getRepoRoot(process.cwd());
            const worktrees = listXtWorktrees(repoRoot);

            if (worktrees.length === 0) {
                console.log(kleur.dim('\n  No xt worktrees found\n'));
                return;
            }

            console.log(t.bold(`\n  xt worktrees (${worktrees.length})\n`));
            for (const wt of worktrees) {
                const branch = wt.branch.replace('refs/heads/', '');
                const merged = isMergedIntoMain(wt.branch, repoRoot);
                const status = merged ? kleur.green('merged') : kleur.yellow('open');
                const prunable = wt.prunable ? kleur.dim(' [prunable]') : '';
                console.log(`  ${status} ${kleur.bold(branch)}${prunable}`);
                console.log(kleur.dim(`         ${wt.path}`));
            }
            console.log('');
        });

    cmd.command('clean')
        .description('Remove worktrees whose branch has been merged into main')
        .option('-y, --yes', 'Skip confirmation prompt', false)
        .action(async (opts) => {
            const repoRoot = getRepoRoot(process.cwd());
            const worktrees = listXtWorktrees(repoRoot);
            const merged = worktrees.filter(wt => isMergedIntoMain(wt.branch, repoRoot));

            if (merged.length === 0) {
                console.log(kleur.dim('\n  No merged xt worktrees to clean\n'));
                return;
            }

            console.log(t.bold(`\n  ${merged.length} merged worktree(s) to remove:\n`));
            for (const wt of merged) {
                console.log(kleur.dim(`  - ${wt.path} (${wt.branch.replace('refs/heads/', '')})`));
            }

            let doRemove = opts.yes;
            if (!opts.yes) {
                const { confirm } = await prompts({
                    type: 'confirm',
                    name: 'confirm',
                    message: `Remove ${merged.length} worktree(s)?`,
                    initial: true,
                });
                doRemove = confirm;
            }

            if (!doRemove) {
                console.log(kleur.dim('  Cancelled\n'));
                return;
            }

            for (const wt of merged) {
                const r = spawnSync('git', ['worktree', 'remove', wt.path, '--force'], {
                    cwd: repoRoot, encoding: 'utf8', stdio: 'pipe',
                });
                if (r.status === 0) {
                    console.log(t.success(`  ✓ Removed ${wt.path}`));
                } else {
                    console.log(kleur.yellow(`  ⚠ Could not remove ${wt.path}: ${(r.stderr ?? '').trim()}`));
                }
            }
            console.log('');
        });

    cmd.command('remove <name>')
        .description('Manually remove a specific xt worktree by branch name or path')
        .option('-y, --yes', 'Skip confirmation', false)
        .action(async (name: string, opts) => {
            const repoRoot = getRepoRoot(process.cwd());
            const worktrees = listXtWorktrees(repoRoot);
            const target = worktrees.find(wt =>
                wt.path === name ||
                wt.branch === `refs/heads/${name}` ||
                wt.branch === `refs/heads/xt/${name}`
            );

            if (!target) {
                console.error(kleur.red(`\n  ✗ No xt worktree found matching "${name}"\n`));
                console.log(kleur.dim('  Run: xt worktree list\n'));
                process.exit(1);
            }

            let doRemove = opts.yes;
            if (!opts.yes) {
                const { confirm } = await prompts({
                    type: 'confirm',
                    name: 'confirm',
                    message: `Remove ${target.path}?`,
                    initial: false,
                });
                doRemove = confirm;
            }

            if (!doRemove) { console.log(kleur.dim('  Cancelled\n')); return; }

            const r = spawnSync('git', ['worktree', 'remove', target.path, '--force'], {
                cwd: repoRoot, encoding: 'utf8', stdio: 'pipe',
            });
            if (r.status === 0) {
                console.log(t.success(`\n  ✓ Removed ${target.path}\n`));
            } else {
                console.error(kleur.red(`\n  ✗ Failed: ${(r.stderr ?? '').trim()}\n`));
                process.exit(1);
            }
        });

    return cmd;
}
