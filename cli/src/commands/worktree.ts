import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve, sep } from 'node:path';
import type { SessionMeta } from '../utils/worktree-session.js';
import { unregisterPluginsForWorktree } from '../utils/worktree-session.js';
import { t } from '../utils/theme.js';

export interface WorktreeInfo {
    path: string;
    branch: string;
    head: string;
    prunable: boolean;
    runtime?: 'claude' | 'pi';
    launchedAt?: string;
    lastLogMsg?: string;
    lastLogTime?: Date;
    nestedInPath?: string;
}

interface RawWorktreeInfo {
    path: string;
    branch?: string;
    head?: string;
    prunable: boolean;
}

function git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return {
        ok: r.status === 0,
        out: (r.stdout ?? '').trim(),
        err: (r.stderr ?? '').trim(),
    };
}

function parseGitWorktreeList(repoRoot: string): RawWorktreeInfo[] {
    const r = git(['worktree', 'list', '--porcelain'], repoRoot);
    if (!r.ok) return [];

    const worktrees: RawWorktreeInfo[] = [];
    let current: Partial<RawWorktreeInfo> = {};

    for (const line of r.out.split('\n')) {
        if (line.startsWith('worktree ')) {
            if (current.path) {
                worktrees.push({
                    path: current.path,
                    branch: current.branch,
                    head: current.head,
                    prunable: Boolean(current.prunable),
                });
            }
            current = { path: line.slice('worktree '.length), prunable: false };
            continue;
        }

        if (line.startsWith('HEAD ')) {
            current.head = line.slice('HEAD '.length);
            continue;
        }

        if (line.startsWith('branch ')) {
            current.branch = line.slice('branch '.length);
            continue;
        }

        if (line === 'prunable') {
            current.prunable = true;
        }
    }

    if (current.path) {
        worktrees.push({
            path: current.path,
            branch: current.branch,
            head: current.head,
            prunable: Boolean(current.prunable),
        });
    }

    return worktrees;
}

function detectNestedParents(paths: string[]): Map<string, string> {
    const nested = new Map<string, string>();
    const sorted = [...paths].sort((a, b) => a.length - b.length);

    for (const childPath of sorted) {
        for (const parentPath of sorted) {
            if (childPath === parentPath) continue;
            if (childPath.startsWith(`${parentPath}${sep}`)) {
                nested.set(childPath, parentPath);
                break;
            }
        }
    }

    return nested;
}

/** Parse `git worktree list --porcelain` output into WorktreeInfo array */
export function listXtWorktrees(repoRoot: string): WorktreeInfo[] {
    const allWorktrees = parseGitWorktreeList(repoRoot);
    const xtWorktrees = allWorktrees.filter(wt => wt.branch?.startsWith('refs/heads/xt/'));
    const nestedParents = detectNestedParents(xtWorktrees.map(wt => wt.path));

    const worktrees: WorktreeInfo[] = xtWorktrees.map(wt => ({
        path: wt.path,
        branch: wt.branch ?? '',
        head: wt.head ?? '',
        prunable: wt.prunable,
        nestedInPath: nestedParents.get(wt.path),
    }));

    // Enrich with session meta and last git activity
    for (const wt of worktrees) {
        try {
            const metaFile = existsSync(join(wt.path, '.xtrm', 'session-meta.json'))
                ? join(wt.path, '.xtrm', 'session-meta.json')
                : join(wt.path, '.session-meta.json');
            const raw = readFileSync(metaFile, 'utf8');
            const meta = JSON.parse(raw) as SessionMeta;
            wt.runtime = meta.runtime;
            wt.launchedAt = meta.launchedAt;
        } catch {
            // no meta — older worktree
        }

        const logR = spawnSync('git', ['log', '-1', '--format=%ci\x1f%s', 'HEAD'], {
            cwd: wt.path,
            encoding: 'utf8',
            stdio: 'pipe',
        });

        if (logR.status === 0 && logR.stdout.trim()) {
            const sepIdx = logR.stdout.trim().indexOf('\x1f');
            if (sepIdx !== -1) {
                wt.lastLogTime = new Date(logR.stdout.slice(0, sepIdx).trim());
                wt.lastLogMsg = logR.stdout.slice(sepIdx + 1).trim();
            }
        }
    }

    return worktrees;
}

function getManagedWorktreeRoot(repoRoot: string): string {
    return join(repoRoot, '.xtrm', 'worktrees');
}

function listOrphanManagedDirs(repoRoot: string): string[] {
    const managedRoot = getManagedWorktreeRoot(repoRoot);
    if (!existsSync(managedRoot)) return [];

    const activePaths = new Set(parseGitWorktreeList(repoRoot).map(wt => resolve(wt.path)));
    const orphans: string[] = [];

    for (const entry of readdirSync(managedRoot)) {
        const fullPath = join(managedRoot, entry);
        let isDirectory = false;
        try {
            isDirectory = statSync(fullPath).isDirectory();
        } catch {
            continue;
        }

        if (!isDirectory) continue;
        if (!activePaths.has(resolve(fullPath))) {
            orphans.push(fullPath);
        }
    }

    return orphans.sort();
}

function runGitWorktreePrune(repoRoot: string): { ok: boolean; message: string } {
    const prune = git(['worktree', 'prune', '--expire', 'now'], repoRoot);
    return {
        ok: prune.ok,
        message: prune.ok ? 'pruned stale git worktree metadata' : prune.err || 'git worktree prune failed',
    };
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

function removeWorktreeEntry(repoRoot: string, worktreePath: string): { ok: boolean; message: string } {
    const remove = git(['worktree', 'remove', worktreePath, '--force'], repoRoot);
    if (!remove.ok) {
        return { ok: false, message: remove.err || `could not remove ${worktreePath}` };
    }

    unregisterPluginsForWorktree(worktreePath);
    clearStatuslineClaim(repoRoot);
    return { ok: true, message: `Removed ${worktreePath}` };
}

export function getRepoRoot(cwd: string): string {
    const commonDirResult = git(['rev-parse', '--git-common-dir'], cwd);
    if (commonDirResult.ok && commonDirResult.out) {
        const commonDir = isAbsolute(commonDirResult.out)
            ? commonDirResult.out
            : resolve(cwd, commonDirResult.out);
        return commonDir.endsWith('/.git') || commonDir.endsWith('\\.git')
            ? dirname(commonDir)
            : commonDir;
    }

    const fallback = git(['rev-parse', '--show-toplevel'], cwd);
    return fallback.ok && fallback.out ? fallback.out : cwd;
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
                const slug = branch.replace('xt/', '');
                const merged = isMergedIntoMain(wt.branch, repoRoot);
                const status = merged ? kleur.green('merged') : kleur.yellow('open');
                const prunable = wt.prunable ? kleur.dim(' [prunable]') : '';
                const runtimeBadge = wt.runtime ? kleur.cyan(` [${wt.runtime}]`) : '';
                const nestedBadge = wt.nestedInPath ? kleur.red(' [nested]') : '';
                const timeStr = wt.lastLogTime
                    ? kleur.dim(wt.lastLogTime.toLocaleString())
                    : wt.launchedAt
                        ? kleur.dim(new Date(wt.launchedAt).toLocaleString())
                        : '';
                const logLine = wt.lastLogMsg ? kleur.dim(`  "${wt.lastLogMsg}"`) : '';

                console.log(`  ${status}${runtimeBadge}${nestedBadge} ${kleur.bold(branch)}${prunable}`);
                if (timeStr) console.log(`    last activity: ${timeStr}${logLine}`);
                console.log(kleur.dim(`    path: ${wt.path}`));
                console.log(kleur.dim(`    resume: xt attach ${slug}`));
                if (wt.nestedInPath) {
                    console.log(kleur.red(`    nested under: ${wt.nestedInPath}`));
                    console.log(kleur.dim('    remediation: xt worktree clean --orphans --dry-run'));
                }
                console.log('');
            }
        });

    cmd.command('doctor')
        .description('Diagnose stale/nested/orphaned worktree state and suggest remediation')
        .action(() => {
            const repoRoot = getRepoRoot(process.cwd());
            const xtWorktrees = listXtWorktrees(repoRoot);
            const orphanDirs = listOrphanManagedDirs(repoRoot);
            const prunable = xtWorktrees.filter(wt => wt.prunable);
            const nested = xtWorktrees.filter(wt => Boolean(wt.nestedInPath));

            console.log(t.bold('\n  xt worktree doctor\n'));
            console.log(kleur.dim(`  repo: ${repoRoot}`));
            console.log(kleur.dim(`  active xt worktrees: ${xtWorktrees.length}`));
            console.log(kleur.dim(`  prunable entries:    ${prunable.length}`));
            console.log(kleur.dim(`  nested entries:      ${nested.length}`));
            console.log(kleur.dim(`  orphan dirs:         ${orphanDirs.length}`));

            if (nested.length > 0) {
                console.log(kleur.red('\n  Nested worktree roots detected:'));
                for (const wt of nested) {
                    console.log(kleur.red(`    - ${wt.path}`));
                    if (wt.nestedInPath) console.log(kleur.dim(`      parent: ${wt.nestedInPath}`));
                }
            }

            if (orphanDirs.length > 0) {
                console.log(kleur.yellow('\n  Orphaned .xtrm/worktrees directories:'));
                for (const orphan of orphanDirs) {
                    console.log(kleur.yellow(`    - ${orphan}`));
                }
            }

            if (nested.length === 0 && orphanDirs.length === 0 && prunable.length === 0) {
                console.log(t.success('\n  ✓ No stale worktree issues detected\n'));
                return;
            }

            console.log(kleur.bold('\n  Remediation:'));
            console.log(kleur.dim('    xt worktree clean --orphans --dry-run'));
            console.log(kleur.dim('    xt worktree clean --orphans --yes'));
            console.log(kleur.dim(`    git -C ${repoRoot} worktree prune --expire now`));
            console.log('');
        });

    cmd.command('clean')
        .description('Remove merged xt worktrees and optionally sweep stale/orphaned worktree state')
        .option('-y, --yes', 'Skip confirmation prompt', false)
        .option('--dry-run', 'Preview clean targets without removing anything', false)
        .option('--orphans', 'Also prune stale git worktree metadata and remove orphan .xtrm/worktrees dirs', false)
        .action(async (opts: { yes: boolean; dryRun: boolean; orphans: boolean }) => {
            const repoRoot = getRepoRoot(process.cwd());
            const worktrees = listXtWorktrees(repoRoot);
            const merged = worktrees.filter(wt =>
                isMergedIntoMain(wt.branch, repoRoot) ||
                getPrStatus(wt.branch, repoRoot).startsWith('merged')
            );
            const orphanDirs = opts.orphans ? listOrphanManagedDirs(repoRoot) : [];

            if (merged.length === 0 && orphanDirs.length === 0 && !opts.orphans) {
                console.log(kleur.dim('\n  No merged xt worktrees to clean\n'));
                return;
            }

            if (merged.length === 0 && orphanDirs.length === 0 && opts.orphans) {
                console.log(kleur.dim('\n  No merged worktrees or orphaned directories found\n'));
                console.log(kleur.dim('  (git worktree prune would still run in apply mode)\n'));
                if (opts.dryRun) return;
            }

            console.log(t.bold('\n  xt worktree clean\n'));

            if (merged.length > 0) {
                console.log(kleur.bold(`  ${merged.length} merged worktree(s):`));
                for (const wt of merged) {
                    console.log(kleur.dim(`    - ${wt.path} (${wt.branch.replace('refs/heads/', '')})`));
                }
            }

            if (opts.orphans) {
                console.log(kleur.bold(`\n  ${orphanDirs.length} orphaned managed director(y/ies):`));
                for (const orphan of orphanDirs) {
                    console.log(kleur.dim(`    - ${orphan}`));
                }
                console.log(kleur.dim('    - git worktree prune --expire now'));
            }

            if (opts.dryRun) {
                console.log(kleur.yellow('\n  ℹ Dry run — no changes applied\n'));
                return;
            }

            let doRemove = opts.yes;
            const totalTargets = merged.length + orphanDirs.length;
            if (!opts.yes) {
                const { confirm } = await prompts({
                    type: 'confirm',
                    name: 'confirm',
                    message: `Apply cleanup for ${totalTargets} item(s)?`,
                    initial: true,
                });
                doRemove = confirm;
            }

            if (!doRemove) {
                console.log(kleur.dim('  Cancelled\n'));
                return;
            }

            let removedCount = 0;

            for (const wt of merged) {
                const result = removeWorktreeEntry(repoRoot, wt.path);
                if (result.ok) {
                    removedCount += 1;
                    console.log(t.success(`  ✓ ${result.message}`));
                } else {
                    console.log(kleur.yellow(`  ⚠ ${result.message}`));
                }
            }

            if (opts.orphans) {
                for (const orphan of orphanDirs) {
                    try {
                        rmSync(orphan, { recursive: true, force: true });
                        removedCount += 1;
                        unregisterPluginsForWorktree(orphan);
                        console.log(t.success(`  ✓ Removed orphan directory ${orphan}`));
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        console.log(kleur.yellow(`  ⚠ Could not remove ${orphan}: ${message}`));
                    }
                }

                const pruneResult = runGitWorktreePrune(repoRoot);
                if (pruneResult.ok) {
                    console.log(t.success(`  ✓ ${pruneResult.message}`));
                } else {
                    console.log(kleur.yellow(`  ⚠ ${pruneResult.message}`));
                }
            }

            if (removedCount === 0) {
                console.log(kleur.yellow('\n  ⚠ Nothing was removed\n'));
                return;
            }

            console.log(t.boldGreen(`\n  ✓ Cleanup complete (${removedCount} item(s) removed)\n`));
        });

    cmd.command('remove <name>')
        .description('Manually remove a specific xt worktree by branch name or path')
        .option('-y, --yes', 'Skip confirmation', false)
        .action(async (name: string, opts: { yes: boolean }) => {
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

            if (!doRemove) {
                console.log(kleur.dim('  Cancelled\n'));
                return;
            }

            const result = removeWorktreeEntry(repoRoot, target.path);
            if (!result.ok) {
                console.error(kleur.red(`\n  ✗ Failed: ${result.message}\n`));
                process.exit(1);
            }

            console.log(t.success(`\n  ✓ ${result.message}\n`));
        });

    return cmd;
}

/** Clear the shared statusline claim file at repo root so no ghost claim shows after worktree removal. */
function clearStatuslineClaim(repoRoot: string): void {
    try {
        const claimFile = join(repoRoot, '.xtrm', 'statusline-claim');
        if (existsSync(claimFile)) unlinkSync(claimFile);
    } catch {
        // non-fatal
    }
}
