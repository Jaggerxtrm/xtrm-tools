import kleur from 'kleur';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { t } from '../utils/theme.js';

declare const __dirname: string;

const OFFICIAL_CLAUDE_MARKETPLACE = 'https://github.com/anthropics/claude-plugins-official';
export const OFFICIAL_CLAUDE_PLUGINS = [
    'serena@claude-plugins-official',
    'context7@claude-plugins-official',
    'github@claude-plugins-official',
    'ralph-loop@claude-plugins-official',
] as const;

export interface ClaudeRuntimeSyncOptions {
    repoRoot: string;
    dryRun?: boolean;
    isGlobal?: boolean;
}

export interface ClaudeRuntimeSyncResult {
    installedOfficial: number;
    alreadyInstalledOfficial: number;
    failedOfficial: string[];
    verificationPassed: boolean;
}

export function renderClaudeRuntimePlanSummary(): void {
    console.log(kleur.bold('\n  Claude Runtime Sync'));
    console.log(`${kleur.cyan('  •')}  xtrm-tools plugin install/update`);
    console.log(`${kleur.cyan('  •')}  register official marketplace: claude-plugins-official`);
    console.log(`${kleur.cyan('  •')}  official plugins: ${OFFICIAL_CLAUDE_PLUGINS.join(', ')}`);
    console.log(`${kleur.cyan('  •')}  cleanup stale pre-plugin files`);
    console.log(`${kleur.cyan('  •')}  verify plugin state`);
}

export async function runClaudeRuntimeSyncPhase(opts: ClaudeRuntimeSyncOptions): Promise<ClaudeRuntimeSyncResult> {
    const { repoRoot, dryRun = false, isGlobal = false } = opts;

    console.log(t.bold('\n  ⚙  xtrm-tools  (Claude Code plugin)'));
    warnIfOutdated();

    const scope = isGlobal ? 'user' : 'project';

    if (dryRun) {
        console.log(kleur.dim(`  [DRY RUN] Would register xtrm-tools marketplace and install plugin (--scope ${scope})`));
        await cleanStalePrePluginFiles(repoRoot, true);

        const dryRunResult: ClaudeRuntimeSyncResult = {
            installedOfficial: 0,
            alreadyInstalledOfficial: OFFICIAL_CLAUDE_PLUGINS.length,
            failedOfficial: [],
            verificationPassed: true,
        };

        console.log(t.bold('\n  ⚙  official Claude plugins  (serena/context7/github/ralph-loop)'));
        console.log(kleur.dim(`  [DRY RUN] Would register claude-plugins-official marketplace and install official plugins (--scope ${scope})`));
        console.log(kleur.dim('  [DRY RUN] Would verify xtrm-tools + official plugin presence\n'));

        return dryRunResult;
    }

    const xtrmPkgRoot = path.resolve(__dirname, '..', '..');
    spawnSync('claude', ['plugin', 'marketplace', 'add', xtrmPkgRoot, '--scope', scope], { stdio: 'pipe' });

    const installedPluginsPath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
    const pluginSourceDir = path.join(xtrmPkgRoot, 'plugins', 'xtrm-tools');
    let cachePath: string | undefined;

    if (fs.existsSync(installedPluginsPath)) {
        try {
            const installed = JSON.parse(fs.readFileSync(installedPluginsPath, 'utf8'));
            const entries: Array<{ installPath?: string }> = installed?.plugins?.['xtrm-tools@xtrm-tools'] ?? [];
            cachePath = entries.find((e) => e.installPath && fs.existsSync(e.installPath))?.installPath;
        } catch {
            cachePath = undefined;
        }
    }

    if (cachePath) {
        try {
            const srcMcp = path.join(pluginSourceDir, '.mcp.json');
            const dstMcp = path.join(cachePath, '.mcp.json');
            if (fs.existsSync(srcMcp)) fs.copyFileSync(srcMcp, dstMcp);

            const srcPlugin = path.join(pluginSourceDir, '.claude-plugin', 'plugin.json');
            const dstPlugin = path.join(cachePath, '.claude-plugin', 'plugin.json');
            if (fs.existsSync(srcPlugin)) {
                fs.ensureDirSync(path.dirname(dstPlugin));
                fs.copyFileSync(srcPlugin, dstPlugin);
            }
        } catch {
            // non-fatal — cache refresh is best-effort
        }
        console.log(t.success('  ✓ xtrm-tools plugin up to date'));
    } else {
        spawnSync('claude', ['plugin', 'install', 'xtrm-tools@xtrm-tools', '--scope', scope], { stdio: 'inherit' });
        console.log(t.success('  ✓ xtrm-tools plugin installed'));
        console.log(t.warning('  ↻ Restart Claude Code for the new plugin hooks to take effect'));
    }

    await cleanStalePrePluginFiles(repoRoot, false);

    const officialPluginResult = installOfficialClaudePlugins(isGlobal);
    installUserStatusLine(false);

    const verificationPassed = verifyClaudeRuntimeSync();

    return {
        ...officialPluginResult,
        verificationPassed,
    };
}

function installOfficialClaudePlugins(isGlobal: boolean): Pick<ClaudeRuntimeSyncResult, 'installedOfficial' | 'alreadyInstalledOfficial' | 'failedOfficial'> {
    console.log(t.bold('\n  ⚙  official Claude plugins  (serena/context7/github/ralph-loop)'));

    const scope = isGlobal ? 'user' : 'project';

    spawnSync('claude', ['plugin', 'marketplace', 'add', OFFICIAL_CLAUDE_MARKETPLACE, '--scope', scope], { stdio: 'pipe' });

    const listResult = spawnSync('claude', ['plugin', 'list'], { encoding: 'utf8', stdio: 'pipe' });
    const installedOutput = listResult.stdout ?? '';

    let installedCount = 0;
    let alreadyInstalledCount = 0;
    const failedOfficial: string[] = [];

    for (const pluginId of OFFICIAL_CLAUDE_PLUGINS) {
        if (installedOutput.includes(pluginId)) {
            alreadyInstalledCount += 1;
            continue;
        }

        const result = spawnSync('claude', ['plugin', 'install', pluginId, '--scope', scope], { stdio: 'inherit' });
        if (result.status === 0) {
            installedCount += 1;
        } else {
            failedOfficial.push(pluginId);
            console.log(t.warning(`  ! Failed to install ${pluginId}. Install manually: claude plugin install ${pluginId} --scope ${scope}`));
        }
    }

    console.log(t.success(`  ✓ Official plugins ready (${installedCount} installed, ${alreadyInstalledCount} already present)\n`));

    return {
        installedOfficial: installedCount,
        alreadyInstalledOfficial: alreadyInstalledCount,
        failedOfficial,
    };
}

async function cleanStalePrePluginFiles(repoRoot: string, dryRun: boolean): Promise<void> {
    const home = os.homedir();
    const staleHooksDir = path.join(home, '.claude', 'hooks');
    const staleSkillsDir = path.join(home, '.claude', 'skills');
    const settingsPath = path.join(home, '.claude', 'settings.json');

    const removed: string[] = [];

    const repoHooksDir = path.join(repoRoot, 'hooks');
    if (await fs.pathExists(repoHooksDir) && await fs.pathExists(staleHooksDir)) {
        const repoHookNames = (await fs.readdir(repoHooksDir)).filter((n) => n !== 'README.md' && n !== 'hooks.json');
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

    const repoSkillsDir = path.join(repoRoot, 'skills');
    if (await fs.pathExists(repoSkillsDir) && await fs.pathExists(staleSkillsDir)) {
        const repoSkillNames = (await fs.readdir(repoSkillsDir)).filter((n) => !n.startsWith('.'));
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
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 5000,
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
    } catch {
        // network failure or parse error — silently skip
    }
}

function installUserStatusLine(dryRun: boolean): void {
    try {
        const scriptPath = path.resolve(__dirname, '..', '..', 'hooks', 'statusline.mjs');
        if (!fs.existsSync(scriptPath)) return;

        const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

        const settings = fs.existsSync(settingsPath)
            ? JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
            : {};

        if (dryRun) {
            console.log(kleur.dim('  [DRY RUN] Would write statusLine → ~/.claude/settings.json'));
            return;
        }

        settings.statusLine = { type: 'command', command: `node ${scriptPath}`, padding: 1 };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        console.log(t.success('  ✓ statusLine registered in ~/.claude/settings.json'));
    } catch {
        // non-fatal
    }
}

function verifyClaudeRuntimeSync(): boolean {
    const listResult = spawnSync('claude', ['plugin', 'list'], { encoding: 'utf8', stdio: 'pipe' });
    const pluginOutput = listResult.stdout ?? '';

    const missing: string[] = [];
    if (!pluginOutput.includes('xtrm-tools@xtrm-tools') && !pluginOutput.includes('xtrm-tools')) {
        missing.push('xtrm-tools@xtrm-tools');
    }

    for (const pluginId of OFFICIAL_CLAUDE_PLUGINS) {
        if (!pluginOutput.includes(pluginId)) {
            missing.push(pluginId);
        }
    }

    if (missing.length === 0) {
        console.log(t.success('  ✓ Claude runtime verification passed'));
        return true;
    }

    console.log(t.warning(`  ! Claude runtime verification incomplete (${missing.length} missing): ${missing.join(', ')}`));
    return false;
}
