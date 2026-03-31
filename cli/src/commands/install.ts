import { Command } from 'commander';
import kleur from 'kleur';
import { Listr } from 'listr2';
import os from 'os';
import fs from 'fs-extra';
import { spawnSync } from 'node:child_process';
import { getContext } from '../core/context.js';
import { calculateDiff, PruneModeReadError } from '../core/diff.js';
import { executeSync } from '../core/sync-executor.js';
import { findRepoRoot } from '../utils/repo-root.js';
import { t, sym } from '../utils/theme.js';
import path from 'path';
import { runPiInstall } from './pi-install.js';
import { runClaudeRuntimeSyncPhase } from '../core/claude-runtime-sync.js';
import { confirmDestructiveAction } from '../utils/confirmation.js';

interface TargetChanges {
    target: string;
    changeSet: any;
    totalChanges: number;
    skippedDrifted: string[];
    error?: string;
}

interface DiffCtx {
    allChanges: TargetChanges[];
}

import type { ChangeSet } from '../types/config.js';

function renderPlanTable(allChanges: TargetChanges[]): void {
    const Table = require('cli-table3');

    const table = new Table({
        head: [
            t.header('Target'),
            t.header('+ New'),
            t.header('↑ Update'),
            t.header('Total'),
        ],
        style: { head: [], border: [] },
    });

    for (const { target, changeSet, totalChanges } of allChanges) {
        const missing = Object.values(changeSet).reduce((s: number, c: any) => s + c.missing.length, 0) as number;
        const outdated = Object.values(changeSet).reduce((s: number, c: any) => s + c.outdated.length, 0) as number;

        table.push([
            formatTargetLabel(target),
            missing > 0 ? String(missing) : t.label('—'),
            outdated > 0 ? String(outdated) : t.label('—'),
            kleur.bold(String(totalChanges)),
        ]);
    }

    console.log('\n' + table.toString() + '\n');
}

function printNextSteps(): void {
    const d = (s: string) => kleur.dim(s);
    const b = (s: string) => kleur.bold(s);

    console.log(b('  Next steps\n'));

    console.log(d('  In your project:'));
    console.log(`  xtrm init                     ${d('initialize beads + gitnexus for this repo')}`);
    console.log(`  bd prime                      ${d('load session context and available work')}`);
    console.log(`  bv --robot-triage             ${d('graph-aware triage — find highest-impact work')}`);
    console.log(`  bd update <id> --claim        ${d('claim an issue before editing any file')}`);
    console.log(`  bd close <id>                 ${d('close when done')}`);

    console.log('');
    console.log(d('  Worktree workflow:'));
    console.log(`  xt claude                     ${d('launch Claude Code in a sandboxed worktree')}`);
    console.log(`  xt end --dry-run              ${d('preview PR title, body, and linked issues')}`);
    console.log(`  xt end                        ${d('push branch, open PR, clean up worktree')}`);

    console.log('');
    console.log(d('  Reference:'));
    console.log(`  xtrm status                   ${d('check installed vs repo')}`);
    console.log(`  xtrm docs show                ${d('browse all documentation')}`);
    console.log('');
}

async function renderSummaryCard(
    allChanges: TargetChanges[],
    totalCount: number,
    allSkipped: string[],
    isDryRun: boolean,
): Promise<void> {
    const boxen = (await import('boxen')).default;

    const hasDrift = allSkipped.length > 0;
    const lines = [
        kleur.bold('  ✓ Install complete') + (hasDrift ? kleur.dim('  (with skipped drift)') : ''),
        '',
        `  ${t.label('Targets')}   ${allChanges.length} environment${allChanges.length !== 1 ? 's' : ''}`,
        `  ${t.label('Installed')} ${totalCount} item${totalCount !== 1 ? 's' : ''}`,
        ...(hasDrift ? [
            `  ${t.label('Skipped')}   ${allSkipped.length} drifted (local changes preserved)`,
            `  ${t.label('Hint')}      run xtrm install --backport to push them back`,
        ] : []),
        ...(isDryRun ? ['', kleur.dim('  Dry run — no changes written')] : []),
    ];

    console.log('\n' + boxen(lines.join('\n'), {
        padding: { top: 1, bottom: 1, left: 1, right: 3 },
        borderStyle: 'round',
        borderColor: 'gray',
    }) + '\n');
}

import {
    runMachineBootstrapPhase,
} from '../core/machine-bootstrap.js';

function formatTargetLabel(target: string): string {
    const normalized = target.replace(/\\/g, '/').toLowerCase();
    const home = os.homedir().replace(/\\/g, '/').toLowerCase();
    if (normalized.endsWith('/.agents/skills') || normalized.includes('/.agents/skills/')) {
        return normalized.startsWith(home) ? '~/.agents/skills' : '.agents/skills';
    }
    return path.basename(target);
}

export { isBeadsInstalled, isDoltInstalled, isDeepwikiInstalled, isBvInstalled } from '../core/machine-bootstrap.js';


export function createInstallAllCommand(): Command {
    // Deprecated: kept temporarily for backward compat; use bare 'xtrm install'
    return new Command('all')
        .description('[deprecated] Use xtrm install')
        .option('--dry-run', 'Preview changes without making any modifications', false)
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--no-mcp', 'Skip MCP server registration', false)
        .option('--force', 'Overwrite locally drifted files', false)
        .action(async (_opts) => {
            console.log('xtrm install all is deprecated — use: xtrm install');
        });
}

export function createInstallBasicCommand(): Command {
    // Deprecated: kept temporarily for backward compat; use bare 'xtrm install'
    return new Command('basic')
        .description('[deprecated] Use xtrm install')
        .option('--dry-run', 'Preview changes without making any modifications', false)
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--no-mcp', 'Skip MCP server registration', false)
        .option('--force', 'Overwrite locally drifted files', false)
        .action(async (_opts) => {
            console.log('xtrm install basic is deprecated — use: xtrm install');
        });
}

export interface InstallOpts {
    dryRun?: boolean;
    yes?: boolean;
    prune?: boolean;
    backport?: boolean;
    global?: boolean;
    /** Skip machine bootstrap (beads/dolt/bv/deepwiki) — used by the init orchestrator which handles it in a dedicated phase. */
    skipMachineBootstrap?: boolean;
    /** Skip Claude runtime sync (xtrm-tools plugin, official plugins, cleanup, verification). */
    skipClaudeRuntimeSync?: boolean;
}

// ── Machine Bootstrap ─────────────────────────────────────────────────────────
// Delegates to the unified machine-bootstrap module. Kept as a thin wrapper
// so existing callers (init.ts) don't need immediate refactoring.

export async function runMachineBootstrap(opts: { yes?: boolean } = {}): Promise<void> {
    await runMachineBootstrapPhase({ dryRun: false });
}

async function trySymlinkOrCopy(sourcePath: string, targetPath: string, dryRun: boolean): Promise<'symlink' | 'copy' | 'noop'> {
    if (dryRun) return 'noop';

    await fs.ensureDir(path.dirname(targetPath));

    const sourceRealPath = await fs.realpath(sourcePath).catch(() => path.resolve(sourcePath));
    const existingStat = await fs.lstat(targetPath).catch(() => null);
    if (existingStat?.isSymbolicLink()) {
        const targetRealPath = await fs.realpath(targetPath).catch(() => null);
        if (targetRealPath && targetRealPath === sourceRealPath) {
            return 'noop';
        }
    }

    await fs.remove(targetPath);

    try {
        await fs.ensureSymlink(sourcePath, targetPath);
        return 'symlink';
    } catch {
        await fs.copy(sourcePath, targetPath);
        return 'copy';
    }
}

async function prepareSkillsSymlinkLayout(params: {
    dryRun: boolean;
    isGlobal: boolean;
    projectRoot: string;
    repoRoot: string;
}): Promise<void> {
    const { dryRun, isGlobal, projectRoot, repoRoot } = params;
    const baseRoot = isGlobal ? os.homedir() : projectRoot;
    const packageSkillsPath = path.join(repoRoot, 'skills');
    const registryDefaultPath = path.join(baseRoot, '.xtrm', 'skills', 'default');
    const agentsSkillsPath = path.join(baseRoot, '.agents', 'skills');

    const registryMode = await trySymlinkOrCopy(packageSkillsPath, registryDefaultPath, dryRun);
    if (registryMode === 'symlink') {
        console.log(kleur.dim(`  ✓ .xtrm/skills/default → ${packageSkillsPath}`));
    } else if (registryMode === 'copy') {
        console.log(kleur.yellow('  ⚠ Could not create .xtrm/skills/default symlink; using copy fallback'));
    }

    const agentsMode = await trySymlinkOrCopy(registryDefaultPath, agentsSkillsPath, dryRun);
    if (agentsMode === 'symlink') {
        console.log(kleur.dim('  ✓ .agents/skills → .xtrm/skills/default'));
    } else if (agentsMode === 'copy') {
        console.log(kleur.yellow('  ⚠ Could not create .agents/skills symlink; using copy fallback'));
    }
}

export async function runInstall(opts: InstallOpts = {}): Promise<void> {
            const { dryRun = false, yes = false, prune = false, backport = false, global: isGlobal = false, skipMachineBootstrap = false, skipClaudeRuntimeSync = false } = opts;
            const effectiveYes = yes || process.argv.includes('--yes') || process.argv.includes('-y');

            const syncType: 'sync' | 'backport' = backport ? 'backport' : 'sync';
            const actionLabel = backport ? 'backport' : 'install';

            // Use git to find the actual project root for Pi install target
            // findRepoRoot() finds the xtrm-tools source repo, not the target project
            const gitResult = spawnSync('git', ['rev-parse', '--show-toplevel'], {
                cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe',
            });
            const projectRoot = gitResult.status === 0 ? (gitResult.stdout ?? '').trim() : process.cwd();
            
            // Source repo for skills/hooks sync
            const repoRoot = await findRepoRoot();

            if (!backport) {
                await prepareSkillsSymlinkLayout({
                    dryRun,
                    isGlobal,
                    projectRoot,
                    repoRoot,
                });
            }
            
            const ctx = await getContext({
                createMissingDirs: !dryRun,
                isGlobal,
                projectRoot,
            });
            const { targets, syncMode } = ctx;

            // ── Machine Bootstrap ────────────────────────────────────────────────────
            // Install missing system tools. Skipped when the init orchestrator has
            // already run runMachineBootstrap() as a dedicated phase.
            if (!backport && !skipMachineBootstrap) {
                await runMachineBootstrap({ yes: effectiveYes });
            }

            // ── Claude + Pi Runtime Sync ─────────────────────────────────────────────
            if (!backport) {
                if (!skipClaudeRuntimeSync) {
                    await runClaudeRuntimeSyncPhase({ repoRoot: projectRoot, dryRun, isGlobal });
                }
                await runPiInstall(dryRun, isGlobal, projectRoot);
            }

            // Phase 1: Diff — skills targets only (.agents/skills)
            const diffTasks = new Listr<DiffCtx>(
                targets.map(target => ({
                    title: formatTargetLabel(target),
                    task: async (listCtx, task) => {
                        try {
                            const changeSet = await calculateDiff(repoRoot, target, prune);

                            const totalChanges = Object.values(changeSet).reduce(
                                (sum, c: any) => sum + c.missing.length + c.outdated.length + c.drifted.length, 0,
                            );
                            task.title = `${formatTargetLabel(target)}${t.muted(` — ${totalChanges} change${totalChanges !== 1 ? 's' : ''}`)}`;
                            if (totalChanges > 0) {
                                listCtx.allChanges.push({ target, changeSet, totalChanges, skippedDrifted: [] });
                            }
                        } catch (err) {
                            if (err instanceof PruneModeReadError) {
                                task.title = `${formatTargetLabel(target)} ${kleur.red('(skipped — cannot read in prune mode)')}`;
                            } else {
                                throw err;
                            }
                        }
                    },
                })),
                { concurrent: true, exitOnError: false },
            );

            const diffCtx = await diffTasks.run({ allChanges: [] });
            const allChanges = diffCtx.allChanges;

            if (allChanges.length === 0) {
                console.log('\n' + kleur.bold('✓ Files are up-to-date') + '\n');
                return;
            }

            // Phase 2: Plan table
            renderPlanTable(allChanges);

            if (dryRun) {
                console.log(kleur.dim('  Dry run — no changes written\n'));
                return;
            }

            // Phase 3: Confirmation
            const totalChangesCount = allChanges.reduce((s, c) => s + c.totalChanges, 0);
            const confirmed = await confirmDestructiveAction({
                yes: effectiveYes,
                message: `Proceed with ${actionLabel} (${totalChangesCount} total changes)?`,
                initial: true,
            });
            if (!confirmed) {
                console.log(t.muted('  Install cancelled.\n'));
                return;
            }

            // Phase 4: Execute
            let totalCount = 0;

            for (const { target, changeSet, skippedDrifted } of allChanges) {
                console.log(t.bold(`\n  ${sym.arrow} ${formatTargetLabel(target)}`));

                const count = await executeSync(repoRoot, target, changeSet, syncMode, syncType, dryRun);
                totalCount += count;

                for (const [category, cat] of Object.entries(changeSet)) {
                    const c = cat as any;
                    if (c.drifted.length > 0 && syncType === 'sync') {
                        skippedDrifted.push(...c.drifted.map((item: string) => `${category}/${item}`));
                    }
                }

                console.log(t.success(`  ${sym.ok} ${count} item${count !== 1 ? 's' : ''} installed`));
            }

            // Phase 5: Summary card
            const allSkipped = allChanges.flatMap(c => c.skippedDrifted);
            await renderSummaryCard(allChanges, totalCount, allSkipped, dryRun);

            if (!dryRun && !backport) {
                printNextSteps();
            }
}

export function createInstallCommand(): Command {
    const installCmd = new Command('install')
        .description('[deprecated] Use xtrm init — project-scoped setup in one command')
        .option('--dry-run', 'Preview changes without making any modifications', false)
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--prune', 'Remove items not in the canonical repository', false)
        .option('--backport', 'Backport drifted local changes back to the repository', false)
        .option('--global', 'Install to user-global scope (~/.agents/skills) instead of project-local', false)
        .action(async (opts) => {
            console.log(kleur.yellow('  ⚠  xtrm install is deprecated — use xtrm init\n'));
            await runInstall(opts);
        });

    installCmd.addCommand(createInstallAllCommand());
    installCmd.addCommand(createInstallBasicCommand());

    return installCmd;
}
