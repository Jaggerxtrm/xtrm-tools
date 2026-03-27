import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import { Listr } from 'listr2';
import fs from 'fs-extra';
import os from 'os';
import { getContext } from '../core/context.js';
import { calculateDiff, PruneModeReadError } from '../core/diff.js';
import { executeSync } from '../core/sync-executor.js';
import { findRepoRoot } from '../utils/repo-root.js';
import { t, sym } from '../utils/theme.js';
import path from 'path';
import { runPiInstall } from './pi-install.js';

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

import { execSync } from 'child_process';

import { spawnSync } from 'child_process';
function formatTargetLabel(target: string): string {
    const normalized = target.replace(/\\/g, '/').toLowerCase();
    const home = os.homedir().replace(/\\/g, '/').toLowerCase();
    if (normalized.endsWith('/.agents/skills') || normalized.includes('/.agents/skills/')) {
        return normalized.startsWith(home) ? '~/.agents/skills' : '.agents/skills';
    }
    return path.basename(target);
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

function isDeepwikiInstalled(): boolean {
    try {
        execSync('deepwiki --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}


const OFFICIAL_CLAUDE_MARKETPLACE = 'https://github.com/anthropics/claude-plugins-official';
const OFFICIAL_CLAUDE_PLUGINS = [
    'serena@claude-plugins-official',
    'context7@claude-plugins-official',
    'github@claude-plugins-official',
    'ralph-loop@claude-plugins-official',
] as const;

export async function installOfficialClaudePlugins(dryRun: boolean, isGlobal: boolean = false): Promise<void> {
    console.log(t.bold('\n  ⚙  official Claude plugins  (serena/context7/github/ralph-loop)'));

    const scope = isGlobal ? 'user' : 'project';

    if (dryRun) {
        console.log(kleur.dim(`  [DRY RUN] Would register claude-plugins-official marketplace and install official plugins (--scope ${scope})\n`));
        return;
    }

    // Ensure official marketplace is registered
    spawnSync('claude', ['plugin', 'marketplace', 'add', OFFICIAL_CLAUDE_MARKETPLACE, '--scope', scope], { stdio: 'pipe' });

    const listResult = spawnSync('claude', ['plugin', 'list'], { encoding: 'utf8', stdio: 'pipe' });
    const installedOutput = listResult.stdout ?? '';

    let installedCount = 0;
    let alreadyInstalledCount = 0;

    for (const pluginId of OFFICIAL_CLAUDE_PLUGINS) {
        if (installedOutput.includes(pluginId)) {
            alreadyInstalledCount += 1;
            continue;
        }

        const result = spawnSync('claude', ['plugin', 'install', pluginId, '--scope', scope], { stdio: 'inherit' });
        if (result.status === 0) {
            installedCount += 1;
        } else {
            console.log(t.warning(`  ! Failed to install ${pluginId}. Install manually: claude plugin install ${pluginId} --scope ${scope}`));
        }
    }

    console.log(t.success(`  ✓ Official plugins ready (${installedCount} installed, ${alreadyInstalledCount} already present)\n`));
}

async function cleanStalePrePluginFiles(repoRoot: string, dryRun: boolean): Promise<void> {
    const home = os.homedir();
    const staleHooksDir = path.join(home, '.claude', 'hooks');
    const staleSkillsDir = path.join(home, '.claude', 'skills');
    const settingsPath = path.join(home, '.claude', 'settings.json');

    const removed: string[] = [];

    // Remove stale hook files managed by xtrm-tools (those matching repo hooks/)
    const repoHooksDir = path.join(repoRoot, 'hooks');
    if (await fs.pathExists(repoHooksDir) && await fs.pathExists(staleHooksDir)) {
        const repoHookNames = (await fs.readdir(repoHooksDir)).filter(n => n !== 'README.md' && n !== 'hooks.json');
        for (const name of repoHookNames) {
            const staleFile = path.join(staleHooksDir, name);
            if (await fs.pathExists(staleFile)) {
                if (dryRun) {
                    console.log(kleur.dim(`  [DRY RUN] Would remove stale hook: ~/.claude/hooks/${name}`));
                } else {
                    await fs.remove(staleFile);
                    console.log(t.muted(`  ✗ Removed stale hook: ~/.claude/hooks/${name}`));
                }
                removed.push(`hooks/${name}`);
            }
        }
    }

    // Remove stale skill directories managed by xtrm-tools (those matching repo skills/)
    const repoSkillsDir = path.join(repoRoot, 'skills');
    if (await fs.pathExists(repoSkillsDir) && await fs.pathExists(staleSkillsDir)) {
        const repoSkillNames = (await fs.readdir(repoSkillsDir)).filter(n => !n.startsWith('.'));
        for (const name of repoSkillNames) {
            const staleDir = path.join(staleSkillsDir, name);
            if (await fs.pathExists(staleDir)) {
                if (dryRun) {
                    console.log(kleur.dim(`  [DRY RUN] Would remove stale skill: ~/.claude/skills/${name}`));
                } else {
                    await fs.remove(staleDir);
                    console.log(t.muted(`  ✗ Removed stale skill: ~/.claude/skills/${name}`));
                }
                removed.push(`skills/${name}`);
            }
        }
    }

    // Clean stale settings.json hook entries pointing to ~/.claude/hooks/ (not ${CLAUDE_PLUGIN_ROOT})
    if (await fs.pathExists(settingsPath)) {
        let settings: any;
        try {
            settings = await fs.readJson(settingsPath);
        } catch {
            settings = null;
        }
        if (settings && settings.hooks && typeof settings.hooks === 'object') {
            let settingsModified = false;
            for (const [event, matchers] of Object.entries(settings.hooks)) {
                if (!Array.isArray(matchers)) continue;
                const cleanedMatchers = (matchers as any[]).filter((matcher: any) => {
                    const hooks = Array.isArray(matcher?.hooks) ? matcher.hooks : [];
                    const staleHooks = hooks.filter((h: any) => {
                        const cmd: string = typeof h?.command === 'string' ? h.command : '';
                        return cmd.includes('/.claude/hooks/') && !cmd.includes('${CLAUDE_PLUGIN_ROOT}');
                    });
                    if (staleHooks.length > 0) {
                        for (const h of staleHooks) {
                            const msg = `settings.json [${event}] hook: ${h.command}`;
                            if (dryRun) {
                                console.log(kleur.dim(`  [DRY RUN] Would remove stale ${msg}`));
                            } else {
                                console.log(t.muted(`  ✗ Removed stale ${msg}`));
                            }
                            removed.push(msg);
                        }
                        // Remove stale hooks from matcher; drop matcher if empty
                        const remainingHooks = hooks.filter((h: any) => {
                            const cmd: string = typeof h?.command === 'string' ? h.command : '';
                            return !(cmd.includes('/.claude/hooks/') && !cmd.includes('${CLAUDE_PLUGIN_ROOT}'));
                        });
                        if (remainingHooks.length === 0) return false;
                        matcher.hooks = remainingHooks;
                        settingsModified = true;
                        return true;
                    }
                    return true;
                });
                if (cleanedMatchers.length !== matchers.length) {
                    settings.hooks[event] = cleanedMatchers;
                    settingsModified = true;
                }
            }
            if (settingsModified && !dryRun) {
                await fs.writeJson(settingsPath, settings, { spaces: 2 });
            }
        }
    }

    if (removed.length === 0) {
        console.log(t.success('  ✓ No stale pre-plugin files found'));
    }
}

function warnIfOutdated(): void {
    try {
        const localPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
        const result = spawnSync('npm', ['show', 'xtrm-tools', 'version', '--json'], {
            encoding: 'utf8', stdio: 'pipe', timeout: 5000,
        });
        if (result.status !== 0 || !result.stdout) return;
        const npmVersion: string = JSON.parse(result.stdout.trim());
        const parse = (v: string) => v.split('.').map(Number);
        const [lMaj, lMin, lPat] = parse(localPkg.version);
        const [rMaj, rMin, rPat] = parse(npmVersion);
        const isNewer = rMaj > lMaj || (rMaj === lMaj && rMin > lMin) || (rMaj === lMaj && rMin === lMin && rPat > lPat);
        if (isNewer) {
            console.log(t.warning(`  ⚠  npm has a newer version (${npmVersion} > ${localPkg.version})`));
            console.log(t.label('     Run: npm install -g xtrm-tools@latest'));
        }
    } catch { /* network failure or parse error — silently skip */ }
}

export async function installPlugin(repoRoot: string, dryRun: boolean, isGlobal: boolean = false): Promise<void> {
    console.log(t.bold('\n  ⚙  xtrm-tools  (Claude Code plugin)'));
    warnIfOutdated();

    const scope = isGlobal ? 'user' : 'project';

    if (dryRun) {
        console.log(kleur.dim(`  [DRY RUN] Would register xtrm-tools marketplace and install plugin (--scope ${scope})\n`));
        await cleanStalePrePluginFiles(repoRoot, true);
        await installOfficialClaudePlugins(true, isGlobal);
        return;
    }

    // Register marketplace using the xtrm-tools package root.
    // __dirname in the built CJS bundle is cli/dist/, so ../../ is the package root.
    // Do NOT use repoRoot here — that is the user's project, not the xtrm-tools package.
    const xtrmPkgRoot = path.resolve(__dirname, '..', '..');
    spawnSync('claude', ['plugin', 'marketplace', 'add', xtrmPkgRoot, '--scope', scope], { stdio: 'pipe' });

    // Always uninstall + reinstall to refresh the cached copy from the live repo
    const listResult = spawnSync('claude', ['plugin', 'list'], { encoding: 'utf8', stdio: 'pipe' });
    if (listResult.stdout?.includes('xtrm-tools@xtrm-tools')) {
        spawnSync('claude', ['plugin', 'uninstall', 'xtrm-tools@xtrm-tools'], { stdio: 'inherit' });
    }
    spawnSync('claude', ['plugin', 'install', 'xtrm-tools@xtrm-tools', '--scope', scope], { stdio: 'inherit' });

    console.log(t.success('  ✓ xtrm-tools plugin installed'));
    console.log(t.warning('  ↻ Restart Claude Code for the new plugin hooks to take effect'));

    // Clean up stale pre-plugin files from ~/.claude/hooks/ and ~/.claude/skills/
    await cleanStalePrePluginFiles(repoRoot, dryRun);

    await installOfficialClaudePlugins(false, isGlobal);

    // Write statusLine to settings.json (project-scoped or user-global based on isGlobal).
    installUserStatusLine(dryRun, repoRoot, isGlobal);
}

function installUserStatusLine(dryRun: boolean, projectRoot?: string, isGlobal: boolean = false): void {
    try {
        // Resolve statusline.mjs from the xtrm-tools package root — same pattern as xtrmPkgRoot.
        // __dirname in the CJS bundle is cli/dist/, so ../../hooks/ is always the correct path.
        // This avoids depending on installed_plugins.json which may be absent on fresh machines.
        const scriptPath = path.resolve(__dirname, '..', '..', 'hooks', 'statusline.mjs');
        if (!fs.existsSync(scriptPath)) return;

        const settingsPath = isGlobal || !projectRoot
            ? path.join(os.homedir(), '.claude', 'settings.json')
            : path.join(projectRoot, '.claude', 'settings.json');

        const settings = fs.existsSync(settingsPath)
            ? JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
            : {};

        if (dryRun) {
            console.log(kleur.dim(`  [DRY RUN] Would write statusLine → ${scriptPath}`));
            return;
        }

        if (!isGlobal && projectRoot) {
            fs.ensureDirSync(path.dirname(settingsPath));
        }

        settings.statusLine = { type: 'command', command: `node ${scriptPath}`, padding: 1 };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        const displayPath = isGlobal ? '~/.claude/settings.json' : '.claude/settings.json';
        console.log(t.success(`  ✓ statusLine registered in ${displayPath}`));
    } catch { /* non-fatal */ }
}

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
}

export async function runInstall(opts: InstallOpts = {}): Promise<void> {
            const { dryRun = false, yes = false, prune = false, backport = false, global: isGlobal = false } = opts;
            const effectiveYes = yes || process.argv.includes('--yes') || process.argv.includes('-y');

            const syncType: 'sync' | 'backport' = backport ? 'backport' : 'sync';
            const actionLabel = backport ? 'backport' : 'install';

            const repoRoot = await findRepoRoot();
            const ctx = await getContext({
                createMissingDirs: !dryRun,
                isGlobal,
                projectRoot: repoRoot,
            });
            const { targets, syncMode } = ctx;

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
                        console.log(t.muted('  ℹ Skipped. Re-run after installing beads+dolt.\n'));
                    }
                }
            }

            // bv (beads_viewer)
            if (!backport) {
                console.log(t.bold('\n  ⚙  bv  (beads graph triage)'));

                const bvOk = (() => { try { execSync('bv --version', { stdio: 'ignore' }); return true; } catch { return false; } })();

                if (bvOk) {
                    console.log(t.success('  ✓ bv already installed\n'));
                } else {
                    let doInstall = effectiveYes;
                    if (!effectiveYes) {
                        const { install } = await prompts({
                            type: 'confirm',
                            name: 'install',
                            message: 'Install bv (beads_viewer)? — graph-aware triage for bd issues',
                            initial: true,
                        });
                        doInstall = install;
                    }

                    if (doInstall) {
                        console.log(t.muted('\n  Installing bv...'));
                        spawnSync('bash', ['-c',
                            'curl -fsSL https://raw.githubusercontent.com/Jaggerxtrm/beads_viewer/main/scripts/install-bv.sh | bash',
                        ], { stdio: 'inherit' });
                        console.log(t.success('  ✓ bv installed\n'));
                    } else {
                        console.log(t.muted('  ℹ Skipped.\n'));
                    }
                }
            }

            // deepwiki CLI
            if (!backport) {
                console.log(t.bold('\n  ⚙  deepwiki  (AI-powered repo documentation)'));

                const deepwikiOk = isDeepwikiInstalled();

                if (deepwikiOk) {
                    console.log(t.success('  ✓ deepwiki already installed\n'));
                } else {
                    let doInstall = effectiveYes;
                    if (!effectiveYes) {
                        const { install } = await prompts({
                            type: 'confirm',
                            name: 'install',
                            message: 'Install @seflless/deepwiki?',
                            initial: true,
                        });
                        doInstall = install;
                    }

                    if (doInstall) {
                        console.log(t.muted('\n  Installing @seflless/deepwiki...'));
                        spawnSync('npm', ['install', '-g', '@seflless/deepwiki'], { stdio: 'inherit' });
                        console.log(t.success('  ✓ deepwiki installed\n'));
                    } else {
                        console.log(t.muted('  ℹ Skipped.\n'));
                    }
                }
            }

            // Claude Code: plugin install (handles MCP, skills, hooks — no file-sync needed)
            // Pi: project-scoped extension + package install
            if (!backport) {
                await installPlugin(repoRoot, dryRun, isGlobal);
                await runPiInstall(dryRun, isGlobal, repoRoot);
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
