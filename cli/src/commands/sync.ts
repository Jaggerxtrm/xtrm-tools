import { Command } from 'commander';
import kleur from 'kleur';
// @ts-ignore
import prompts from 'prompts';
import { Listr } from 'listr2';
import { getContext } from '../core/context.js';
import { calculateDiff, PruneModeReadError } from '../core/diff.js';
import { executeSync } from '../core/sync-executor.js';
import { findRepoRoot } from '../utils/repo-root.js';
import { t, sym } from '../utils/theme.js';
import path from 'path';

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

function renderPlanTable(allChanges: TargetChanges[]): void {
    // Dynamic import handled at call site — Table is CJS so require works
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
        const missing  = Object.values(changeSet).reduce((s: number, c: any) => s + c.missing.length,  0) as number;
        const outdated = Object.values(changeSet).reduce((s: number, c: any) => s + c.outdated.length, 0) as number;

        table.push([
            kleur.white(path.basename(target)),           // primary data — white
            missing  > 0 ? kleur.green(String(missing))  : t.label('—'),
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
        hasDrift ? t.boldGreen('  ✓ Sync complete') + t.warning('  (with skipped drift)') : t.boldGreen('  ✓ Sync complete'),
        '',
        `  ${t.label('Targets')}   ${allChanges.length} environment${allChanges.length !== 1 ? 's' : ''}`,
        `  ${t.label('Synced')}    ${totalCount} item${totalCount !== 1 ? 's' : ''}`,
        ...(hasDrift ? [
            `  ${t.label('Skipped')}   ${kleur.yellow(String(allSkipped.length))} drifted (local changes preserved)`,
            `  ${t.label('Hint')}      run ${t.accent('jaggers-config sync --backport')} to push them back`,
        ] : []),
        ...(isDryRun ? ['', t.accent('  Dry run — no changes written')] : []),
    ];

    console.log('\n' + boxen(lines.join('\n'), {
        padding: { top: 1, bottom: 1, left: 1, right: 3 },
        borderStyle: 'round',
        borderColor: hasDrift ? 'yellow' : 'green',
    }) + '\n');
}

export function createSyncCommand(): Command {
    return new Command('sync')
        .description('Sync agent tools (skills, hooks, config) to target environments')
        .option('--dry-run', 'Preview changes without making any modifications', false)
        .option('-y, --yes',  'Skip confirmation prompts', false)
        .option('--prune',    'Remove items not in the canonical repository', false)
        .option('--backport', 'Backport drifted local changes back to the repository', false)
        .action(async (opts) => {
            const { dryRun, yes, prune, backport } = opts;
            const actionType = backport ? 'backport' : 'sync';

            const repoRoot = await findRepoRoot();
            const ctx = await getContext();
            const { targets, syncMode } = ctx;

            // ── Phase 1: Diff (concurrent via listr2) ──────────────────────
            const diffTasks = new Listr<DiffCtx>(
                targets.map(target => ({
                    title: path.basename(target),
                    task: async (listCtx, task) => {
                        try {
                            const changeSet = await calculateDiff(repoRoot, target, prune);
                            const totalChanges = Object.values(changeSet).reduce(
                                (sum, c: any) => sum + c.missing.length + c.outdated.length + c.drifted.length, 0,
                            );
                            task.title = `${path.basename(target)}${t.muted(` — ${totalChanges} change${totalChanges !== 1 ? 's' : ''}`)}`;
                            if (totalChanges > 0) {
                                listCtx.allChanges.push({ target, changeSet, totalChanges, skippedDrifted: [] });
                            }
                        } catch (err) {
                            if (err instanceof PruneModeReadError) {
                                task.title = `${path.basename(target)} ${kleur.red('(skipped — cannot read in prune mode)')}`;
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
                    skills: { missing: [], outdated: [], drifted: [], total: 0 },
                    hooks: { missing: [], outdated: [], drifted: [], total: 0 },
                    config: { missing: [], outdated: [], drifted: [], total: 0 },
                    commands: { missing: [], outdated: [], drifted: [], total: 0 },
                    'qwen-commands': { missing: [], outdated: [], drifted: [], total: 0 },
                    'antigravity-workflows': { missing: [], outdated: [], drifted: [], total: 0 },
                };
                for (const target of targets) {
                    console.log(t.bold(`\n  ${sym.arrow} ${path.basename(target)}`));
                    await executeSync(repoRoot, target, emptyChangeSet, syncMode, 'sync', false);
                }
            }

            if (allChanges.length === 0) {
                console.log('\n' + t.boldGreen('✓ Files are up-to-date') + '\n');
                return;
            }

            // ── Phase 2: Plan table ─────────────────────────────────────────
            renderPlanTable(allChanges);

            if (dryRun) {
                console.log(t.accent('💡 Dry run — no changes written\n'));
                return;
            }

            // ── Phase 3: Confirmation ───────────────────────────────────────
            if (!yes) {
                const totalChangesCount = allChanges.reduce((s, c) => s + c.totalChanges, 0);
                const { confirm } = await prompts({
                    type: 'confirm',
                    name: 'confirm',
                    message: `Proceed with ${actionType} (${totalChangesCount} total changes)?`,
                    initial: true,
                });
                if (!confirm) {
                    console.log(t.muted('  Sync cancelled.\n'));
                    return;
                }
            }

            // ── Phase 4: Execute sync ───────────────────────────────────────
            let totalCount = 0;

            for (const { target, changeSet, skippedDrifted } of allChanges) {
                console.log(t.bold(`\n  ${sym.arrow} ${path.basename(target)}`));

                const count = await executeSync(repoRoot, target, changeSet, syncMode, actionType, dryRun);
                totalCount += count;

                // Track skipped drifted
                for (const [category, cat] of Object.entries(changeSet)) {
                    const c = cat as any;
                    if (c.drifted.length > 0 && actionType === 'sync') {
                        skippedDrifted.push(...c.drifted.map((item: string) => `${category}/${item}`));
                    }
                }

                console.log(t.success(`  ${sym.ok} ${count} item${count !== 1 ? 's' : ''} synced`));
            }

            // ── Phase 5: Summary card ───────────────────────────────────────
            const allSkipped = allChanges.flatMap(c => c.skippedDrifted);
            await renderSummaryCard(allChanges, totalCount, allSkipped, dryRun);
        });
}
