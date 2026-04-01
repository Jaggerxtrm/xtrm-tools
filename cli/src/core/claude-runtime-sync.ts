import kleur from 'kleur';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { t } from '../utils/theme.js';

declare const __dirname: string;

interface CanonicalHookDefinition {
    script: string;
    matcher?: string;
    timeout?: number;
}

interface CanonicalHooksConfig {
    hooks: Record<string, CanonicalHookDefinition[]>;
}

interface CommandHook {
    type: 'command';
    command: string;
    timeout?: number;
}

interface HookWrapper {
    matcher?: string;
    hooks: CommandHook[];
}

interface ClaudeSettings {
    permissions?: {
        allow?: string[];
        defaultMode?: string;
    };
    model?: string;
    skillSuggestions?: {
        enabled?: boolean;
    };
    hooks?: Record<string, HookWrapper[]>;
    [key: string]: unknown;
}

export interface ClaudeRuntimeSyncOptions {
    repoRoot: string;
    dryRun?: boolean;
    isGlobal?: boolean;
}

export interface ClaudeRuntimeSyncResult {
    settingsPath: string;
    hooksEventsWritten: number;
    hooksEntriesWritten: number;
    wroteSettings: boolean;
}

export function renderClaudeRuntimePlanSummary(): void {
    console.log(kleur.bold('\n  Claude Runtime Sync'));
    console.log(`${kleur.cyan('  •')}  read canonical hooks: .xtrm/config/hooks.json`);
    console.log(`${kleur.cyan('  •')}  resolve project hooks dir: <project>/.xtrm/hooks`);
    console.log(`${kleur.cyan('  •')}  write generated hooks into Claude settings.json`);
    console.log(`${kleur.cyan('  •')}  preserve existing settings (permissions/model/skillSuggestions)`);
}

export async function runClaudeRuntimeSyncPhase(opts: ClaudeRuntimeSyncOptions): Promise<ClaudeRuntimeSyncResult> {
    const { repoRoot, dryRun = false, isGlobal = false } = opts;

    console.log(t.bold('\n  ⚙  xtrm-tools  (Claude hooks wiring)'));
    warnIfOutdated();

    const packageRoot = await resolvePackageRoot();
    const hooksConfigPath = path.join(packageRoot, '.xtrm', 'config', 'hooks.json');
    const settingsTemplatePath = path.join(packageRoot, '.xtrm', 'config', 'settings.json');
    const hooksDir = path.resolve(repoRoot, '.xtrm', 'hooks');

    const hooksConfig = await fs.readJson(hooksConfigPath) as CanonicalHooksConfig;
    const generatedHooks = generateHooks(hooksConfig, hooksDir);

    const settingsPath = isGlobal
        ? path.join(os.homedir(), '.claude', 'settings.json')
        : path.join(repoRoot, '.claude', 'settings.json');

    const hasExistingSettings = await fs.pathExists(settingsPath);
    const baseSettings = await readBaseSettings(settingsTemplatePath);
    const existingSettings = hasExistingSettings ? await readSettings(settingsPath) : {};

    const mergedSettings: ClaudeSettings = hasExistingSettings
        ? { ...existingSettings, hooks: generatedHooks }
        : { ...baseSettings, hooks: generatedHooks };

    const hooksEventsWritten = Object.keys(generatedHooks).length;
    const hooksEntriesWritten = countHookEntries(generatedHooks);

    console.log(t.label(`  • hooks source: ${hooksConfigPath}`));
    console.log(t.label(`  • hooks dir: ${hooksDir}`));
    console.log(t.label(`  • target settings: ${settingsPath}`));

    if (hasExistingSettings) {
        console.log(t.muted('  ↻ Existing settings found; merging and replacing only hooks section'));
        if (Array.isArray(existingSettings.permissions?.allow)) {
            console.log(t.muted(`  ↻ Preserved permissions.allow (${existingSettings.permissions.allow.length} entries)`));
        }
        if (typeof existingSettings.model === 'string') {
            console.log(t.muted(`  ↻ Preserved model (${existingSettings.model})`));
        }
        if (typeof existingSettings.skillSuggestions?.enabled === 'boolean') {
            console.log(t.muted(`  ↻ Preserved skillSuggestions.enabled (${existingSettings.skillSuggestions.enabled})`));
        }
    } else {
        console.log(t.muted('  ↻ No existing settings found; creating with template defaults + generated hooks'));
    }

    if (dryRun) {
        console.log(kleur.dim(`  [DRY RUN] Would write ${hooksEntriesWritten} hook commands across ${hooksEventsWritten} events`));
        console.log(kleur.dim('  [DRY RUN] Hooks section would be replaced entirely\n'));
        return {
            settingsPath,
            hooksEventsWritten,
            hooksEntriesWritten,
            wroteSettings: false,
        };
    }

    await fs.ensureDir(path.dirname(settingsPath));
    await fs.writeJson(settingsPath, mergedSettings, { spaces: 2 });

    console.log(t.success(`  ✓ Wrote ${hooksEntriesWritten} hook commands across ${hooksEventsWritten} events`));
    console.log(t.success('  ✓ Claude settings hooks synced\n'));

    return {
        settingsPath,
        hooksEventsWritten,
        hooksEntriesWritten,
        wroteSettings: true,
    };
}

function generateHooks(hooksConfig: CanonicalHooksConfig, hooksDir: string): Record<string, HookWrapper[]> {
    const generated: Record<string, HookWrapper[]> = {};

    for (const [event, hookDefinitions] of Object.entries(hooksConfig.hooks ?? {})) {
        generated[event] = hookDefinitions.map((definition) => {
            const scriptPath = normalizePath(path.resolve(hooksDir, definition.script));
            const commandHook: CommandHook = {
                type: 'command',
                command: buildScriptCommand(definition.script, scriptPath),
            };

            if (typeof definition.timeout === 'number') {
                commandHook.timeout = definition.timeout;
            }

            const wrapper: HookWrapper = { hooks: [commandHook] };
            if (definition.matcher) {
                wrapper.matcher = definition.matcher;
            }
            return wrapper;
        });
    }

    return generated;
}

function buildScriptCommand(scriptName: string, absoluteScriptPath: string): string {
    const extension = path.extname(scriptName).toLowerCase();
    if (extension === '.mjs' || extension === '.cjs' || extension === '.js') {
        return `node "${absoluteScriptPath}"`;
    }
    if (extension === '.sh') {
        return `bash "${absoluteScriptPath}"`;
    }

    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    return `${pythonBin} "${absoluteScriptPath}"`;
}

function countHookEntries(hooks: Record<string, HookWrapper[]>): number {
    let count = 0;
    for (const wrappers of Object.values(hooks)) {
        count += wrappers.length;
    }
    return count;
}

function normalizePath(inputPath: string): string {
    if (process.platform !== 'win32') {
        return inputPath;
    }
    return inputPath.replace(/\\/g, '/');
}

async function readSettings(settingsPath: string): Promise<ClaudeSettings> {
    try {
        return await fs.readJson(settingsPath) as ClaudeSettings;
    } catch {
        return {};
    }
}

async function readBaseSettings(settingsTemplatePath: string): Promise<ClaudeSettings> {
    try {
        return await fs.readJson(settingsTemplatePath) as ClaudeSettings;
    } catch {
        return {
            permissions: {
                allow: [],
                defaultMode: 'default',
            },
            skillSuggestions: {
                enabled: true,
            },
        };
    }
}

async function resolvePackageRoot(): Promise<string> {
    const candidates = [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../..'),
    ];

    for (const candidate of candidates) {
        const hooksConfigPath = path.join(candidate, '.xtrm', 'config', 'hooks.json');
        if (await fs.pathExists(hooksConfigPath)) {
            return candidate;
        }
    }

    throw new Error('Failed to locate xtrm-tools package root (.xtrm/config/hooks.json not found).');
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
