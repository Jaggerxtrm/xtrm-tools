import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import { Listr } from 'listr2';
import fs from 'fs-extra';
import { getContext } from '../core/context.js';
import { calculateDiff, PruneModeReadError } from '../core/diff.js';
import { executeSync } from '../core/sync-executor.js';
import { findRepoRoot } from '../utils/repo-root.js';
import { t, sym } from '../utils/theme.js';
import path from 'path';
import { createInstallProjectCommand } from './install-project.js';

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
            t.header(kleur.green('+ New')),
            t.header(kleur.yellow('↑ Update')),
            t.header('Total'),
        ],
        style: { head: [], border: [] },
    });

    for (const { target, changeSet, totalChanges } of allChanges) {
        const missing = Object.values(changeSet).reduce((s: number, c: any) => s + c.missing.length, 0) as number;
        const outdated = Object.values(changeSet).reduce((s: number, c: any) => s + c.outdated.length, 0) as number;

        table.push([
            kleur.white(formatTargetLabel(target)),
            missing > 0 ? kleur.green(String(missing)) : t.label('—'),
            outdated > 0 ? kleur.yellow(String(outdated)) : t.label('—'),
            kleur.bold().white(String(totalChanges)),
        ]);
    }

    console.log('\n' + table.toString() + '\n');
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
        hasDrift ? t.boldGreen('  ✓ Install complete') + t.warning('  (with skipped drift)') : t.boldGreen('  ✓ Install complete'),
        '',
        `  ${t.label('Targets')}   ${allChanges.length} environment${allChanges.length !== 1 ? 's' : ''}`,
        `  ${t.label('Installed')} ${totalCount} item${totalCount !== 1 ? 's' : ''}`,
        ...(hasDrift ? [
            `  ${t.label('Skipped')}   ${kleur.yellow(String(allSkipped.length))} drifted (local changes preserved)`,
            `  ${t.label('Hint')}      run ${t.accent('xtrm install --backport')} to push them back`,
        ] : []),
        ...(isDryRun ? ['', t.accent('  Dry run — no changes written')] : []),
    ];

    console.log('\n' + boxen(lines.join('\n'), {
        padding: { top: 1, bottom: 1, left: 1, right: 3 },
        borderStyle: 'round',
        borderColor: hasDrift ? 'yellow' : 'green',
    }) + '\n');
}

import { execSync } from 'child_process';

import { spawnSync } from 'child_process';
const BEADS_HOOK_PATTERN = /^beads-/;

function formatTargetLabel(target: string): string {
    const normalized = target.replace(/\\/g, '/').toLowerCase();
    if (normalized.endsWith('/.agents/skills') || normalized.includes('/.agents/skills/')) return '~/.agents/skills';
    if (normalized.endsWith('/.claude') || normalized.includes('/.claude/')) return '~/.claude';
    return path.basename(target);
}

function filterBeadsFromChangeSet(changeSet: ChangeSet): ChangeSet {
    return {
        ...changeSet,
        hooks: {
            ...changeSet.hooks,
            missing: changeSet.hooks.missing.filter(h => !BEADS_HOOK_PATTERN.test(h)),
            outdated: changeSet.hooks.outdated.filter(h => !BEADS_HOOK_PATTERN.test(h)),
            drifted: changeSet.hooks.drifted.filter(h => !BEADS_HOOK_PATTERN.test(h)),
            total: changeSet.hooks.total,
        },
    };
}

function isBeadsInstalled(): boolean {
    try {
        execSync('bd --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function isDoltInstalled(): boolean {
    try {
        execSync('dolt version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

interface GlobalInstallFlags {
    dryRun: boolean;
    yes: boolean;
    noMcp: boolean;
    force: boolean;
}

async function needsSettingsSync(repoRoot: string, target: string): Promise<boolean> {
    const normalizedTarget = target.replace(/\\/g, '/').toLowerCase();
    if (normalizedTarget.includes('.agents/skills')) return false;

    const hooksTemplatePath = path.join(repoRoot, 'config', 'hooks.json');
    if (!await fs.pathExists(hooksTemplatePath)) return false;

    const requiredEvents = Object.keys((await fs.readJson(hooksTemplatePath)).hooks ?? {});
    if (requiredEvents.length === 0) return false;

    const targetSettingsPath = path.join(target, 'settings.json');
    if (!await fs.pathExists(targetSettingsPath)) return true;

    let settings: any = {};
    try {
        settings = await fs.readJson(targetSettingsPath);
    } catch {
        return true;
    }

    const targetHooks = settings?.hooks;
    if (!targetHooks || typeof targetHooks !== 'object' || Object.keys(targetHooks).length === 0) {
        return true;
    }

    return requiredEvents.some((event) => !(event in targetHooks));
}

async function runGlobalInstall(
    flags: GlobalInstallFlags,
    installOpts: { excludeBeads?: boolean; checkBeads?: boolean } = {},
): Promise<void> {
    const { dryRun, yes, noMcp, force } = flags;
    const effectiveYes = yes || process.argv.includes('--yes') || process.argv.includes('-y');
    const repoRoot = await findRepoRoot();
    const ctx = await getContext({ selector: 'all', createMissingDirs: !dryRun });
    const { targets, syncMode } = ctx;

    let skipBeads = installOpts.excludeBeads ?? false;

    if (installOpts.checkBeads && !skipBeads) {
        console.log(t.bold('\n  ⚙  beads + dolt  (workflow enforcement backend)'));
        console.log(t.muted('  beads is a git-backed issue tracker; dolt is its SQL+git storage backend.'));
        console.log(t.muted('  Without them the gate hooks install but provide no enforcement.\n'));

        const beadsOk = isBeadsInstalled();
        const doltOk = isDoltInstalled();

        if (beadsOk && doltOk) {
            console.log(t.success('  ✓ beads + dolt already installed\n'));
        } else {
            const missing = [!beadsOk && 'bd', !doltOk && 'dolt'].filter(Boolean).join(', ');

            let doInstall = effectiveYes;
            if (!effectiveYes) {
                const { install } = await prompts({
                    type: 'confirm',
                    name: 'install',
                    message: `Install beads + dolt? (${missing} not found) — required for workflow enforcement hooks`,
                    initial: true,
                });
                doInstall = install;
            }

            if (doInstall) {
                if (!beadsOk) {
                    console.log(t.muted('\n  Installing @beads/bd...'));
                    spawnSync('npm', ['install', '-g', '@beads/bd'], { stdio: 'inherit' });
                    console.log(t.success('  ✓ bd installed'));
                }
                if (!doltOk) {
                    console.log(t.muted('\n  Installing dolt...'));
                    if (process.platform === 'darwin') {
                        spawnSync('brew', ['install', 'dolt'], { stdio: 'inherit' });
                    } else {
                        spawnSync('sudo', ['bash', '-c',
                            'curl -L https://github.com/dolthub/dolt/releases/latest/download/install.sh | bash',
                        ], { stdio: 'inherit' });
                    }
                    console.log(t.success('  ✓ dolt installed'));
                }
                console.log('');
            } else {
                console.log(t.muted('  ℹ Skipping beads gate hooks. Re-run xtrm install all after installing beads+dolt.\n'));
                skipBeads = true;
            }
        }
    }

    const diffTasks = new Listr<DiffCtx>(
        targets.map(target => ({
            title: formatTargetLabel(target),
            task: async (listCtx, task) => {
                try {
                    let changeSet = await calculateDiff(repoRoot, target, false);
                    if (skipBeads) {
                        changeSet = filterBeadsFromChangeSet(changeSet);
                    }

                    const hasSettingsDiff =
                        changeSet.config.missing.includes('settings.json') ||
                        changeSet.config.outdated.includes('settings.json') ||
                        changeSet.config.drifted.includes('settings.json');

                    if (!hasSettingsDiff && await needsSettingsSync(repoRoot, target)) {
                        changeSet.config.outdated.push('settings.json');
                    }

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
        console.log('\n' + t.boldGreen('✓ Files are up-to-date') + '\n');
        return;
    }

    renderPlanTable(allChanges);

    if (dryRun) {
        console.log(t.accent('💡 Dry run — no changes written\n'));
        return;
    }

    if (!effectiveYes) {
        const totalChangesCount = allChanges.reduce((s, c) => s + c.totalChanges, 0);
        const { confirm } = await prompts({
            type: 'confirm',
            name: 'confirm',
            message: `Proceed with install (${totalChangesCount} total changes)?`,
            initial: true,
        });
        if (!confirm) {
            console.log(t.muted('  Install cancelled.\n'));
            return;
        }
    }

    let totalCount = 0;

    for (const { target, changeSet, skippedDrifted } of allChanges) {
        console.log(t.bold(`\n  ${sym.arrow} ${formatTargetLabel(target)}`));

        const count = await executeSync(repoRoot, target, changeSet, syncMode, 'sync', dryRun, undefined, {
            skipMcp: noMcp,
            force,
        });
        totalCount += count;

        for (const [category, cat] of Object.entries(changeSet)) {
            const c = cat as any;
            if (c.drifted.length > 0 && !force) {
                skippedDrifted.push(...c.drifted.map((item: string) => `${category}/${item}`));
            }
        }

        console.log(t.success(`  ${sym.ok} ${count} item${count !== 1 ? 's' : ''} installed`));
    }

    const allSkipped = allChanges.flatMap(c => c.skippedDrifted);
    await renderSummaryCard(allChanges, totalCount, allSkipped, dryRun);
}

export function createInstallAllCommand(): Command {
    return new Command('all')
        .description('Install everything: skills, all hooks (including beads gates), and MCP servers')
        .option('--dry-run', 'Preview changes without making any modifications', false)
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--no-mcp', 'Skip MCP server registration', false)
        .option('--force', 'Overwrite locally drifted files', false)
        .action(async (opts) => {
            await runGlobalInstall(
                { dryRun: opts.dryRun, yes: opts.yes, noMcp: opts.mcp === false, force: opts.force },
                { checkBeads: true },
            );
        });
}

export function createInstallBasicCommand(): Command {
    return new Command('basic')
        .description('Install skills, general hooks, and MCP servers (no beads gate hooks)')
        .option('--dry-run', 'Preview changes without making any modifications', false)
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--no-mcp', 'Skip MCP server registration', false)
        .option('--force', 'Overwrite locally drifted files', false)
        .action(async (opts) => {
            await runGlobalInstall(
                { dryRun: opts.dryRun, yes: opts.yes, noMcp: opts.mcp === false, force: opts.force },
                { excludeBeads: true },
            );
        });
}

export function createInstallCommand(): Command {
    const installCmd = new Command('install')
        .description('Install Claude Code tools (skills, hooks, MCP servers)')
        .argument('[target-selector]', 'Install targets: use "*" or "all" to skip interactive target selection')
        .option('--dry-run', 'Preview changes without making any modifications', false)
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--prune', 'Remove items not in the canonical repository', false)
        .option('--backport', 'Backport drifted local changes back to the repository', false)
        .action(async (targetSelector, opts) => {
            const { dryRun, yes, prune, backport } = opts;
            const effectiveYes = yes || process.argv.includes('--yes') || process.argv.includes('-y');
            const syncType: 'sync' | 'backport' = backport ? 'backport' : 'sync';
            const actionLabel = backport ? 'backport' : 'install';

            const repoRoot = await findRepoRoot();
            const ctx = await getContext({
                selector: targetSelector,
                createMissingDirs: !dryRun,
            });
            const { targets, syncMode } = ctx;
            let skipBeads = false;

            if (!backport) {
                console.log(t.bold('\n  ⚙  beads + dolt  (workflow enforcement backend)'));
                console.log(t.muted('  beads is a git-backed issue tracker; dolt is its SQL+git storage backend.'));
                console.log(t.muted('  Without them the gate hooks install but provide no enforcement.\n'));

                const beadsOk = isBeadsInstalled();
                const doltOk = isDoltInstalled();

                if (beadsOk && doltOk) {
                    console.log(t.success('  ✓ beads + dolt already installed\n'));
                } else {
                    const missing = [!beadsOk && 'bd', !doltOk && 'dolt'].filter(Boolean).join(', ');

                    let doInstall = effectiveYes;
                    if (!effectiveYes) {
                        const { install } = await prompts({
                            type: 'confirm',
                            name: 'install',
                            message: `Install beads + dolt? (${missing} not found) — required for workflow enforcement hooks`,
                            initial: true,
                        });
                        doInstall = install;
                    }

                    if (doInstall) {
                        if (!beadsOk) {
                            console.log(t.muted('\n  Installing @beads/bd...'));
                            spawnSync('npm', ['install', '-g', '@beads/bd'], { stdio: 'inherit' });
                            console.log(t.success('  ✓ bd installed'));
                        }
                        if (!doltOk) {
                            console.log(t.muted('\n  Installing dolt...'));
                            if (process.platform === 'darwin') {
                                spawnSync('brew', ['install', 'dolt'], { stdio: 'inherit' });
                            } else {
                                spawnSync('sudo', ['bash', '-c',
                                    'curl -L https://github.com/dolthub/dolt/releases/latest/download/install.sh | bash',
                                ], { stdio: 'inherit' });
                            }
                            console.log(t.success('  ✓ dolt installed'));
                        }
                        console.log('');
                    } else {
                        console.log(t.muted('  ℹ Skipping beads gate hooks for this install run.\n'));
                        skipBeads = true;
                    }
                }
            }

            // Phase 1: Diff (concurrent via listr2)
            const diffTasks = new Listr<DiffCtx>(
                targets.map(target => ({
                    title: formatTargetLabel(target),
                    task: async (listCtx, task) => {
                        try {
                            let changeSet = await calculateDiff(repoRoot, target, prune);
                            if (skipBeads) {
                                changeSet = filterBeadsFromChangeSet(changeSet);
                            }

                            if (syncType === 'sync' && !prune) {
                                const hasSettingsDiff =
                                    changeSet.config.missing.includes('settings.json') ||
                                    changeSet.config.outdated.includes('settings.json') ||
                                    changeSet.config.drifted.includes('settings.json');

                                if (!hasSettingsDiff && await needsSettingsSync(repoRoot, target)) {
                                    changeSet.config.outdated.push('settings.json');
                                }
                            }

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

            // MCP sync always runs regardless of file changes
            if (!backport && !dryRun) {
                const emptyChangeSet = {
                    skills: { missing: [] as string[], outdated: [] as string[], drifted: [] as string[], total: 0 },
                    hooks: { missing: [] as string[], outdated: [] as string[], drifted: [] as string[], total: 0 },
                    config: { missing: [] as string[], outdated: [] as string[], drifted: [] as string[], total: 0 },
                    commands: { missing: [] as string[], outdated: [] as string[], drifted: [] as string[], total: 0 },
                    'qwen-commands': { missing: [] as string[], outdated: [] as string[], drifted: [] as string[], total: 0 },
                    'antigravity-workflows': { missing: [] as string[], outdated: [] as string[], drifted: [] as string[], total: 0 },
                };
                for (const target of targets) {
                    console.log(t.bold(`\n  ${sym.arrow} ${formatTargetLabel(target)}`));
                    await executeSync(repoRoot, target, emptyChangeSet, syncMode, 'sync', false);
                }
            }

            if (allChanges.length === 0) {
                console.log('\n' + t.boldGreen('✓ Files are up-to-date') + '\n');
                return;
            }

            // Phase 2: Plan table
            renderPlanTable(allChanges);

            if (dryRun) {
                console.log(t.accent('💡 Dry run — no changes written\n'));
                return;
            }

            // Phase 3: Confirmation
            if (!effectiveYes) {
                const totalChangesCount = allChanges.reduce((s, c) => s + c.totalChanges, 0);
                const { confirm } = await prompts({
                    type: 'confirm',
                    name: 'confirm',
                    message: `Proceed with ${actionLabel} (${totalChangesCount} total changes)?`,
                    initial: true,
                });
                if (!confirm) {
                    console.log(t.muted('  Install cancelled.\n'));
                    return;
                }
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
        });

    // Add subcommands
    installCmd.addCommand(createInstallAllCommand());
    installCmd.addCommand(createInstallBasicCommand());
    installCmd.addCommand(createInstallProjectCommand());

    return installCmd;
}
