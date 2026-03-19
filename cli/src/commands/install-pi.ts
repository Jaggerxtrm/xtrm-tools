import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { findRepoRoot } from '../utils/repo-root.js';
import { t, sym } from '../utils/theme.js';

const PI_AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent');

export interface PiExtensionDiff {
    missing: string[];
    stale: string[];
    upToDate: string[];
}

interface SchemaField { key: string; label: string; hint: string; secret: boolean; required: boolean; }
interface OAuthProvider { key: string; instruction: string; }
interface InstallSchema { fields: SchemaField[]; oauth_providers: OAuthProvider[]; packages: string[]; }

export const EXTRA_PI_CONFIGS = ['pi-worktrees-settings.json'];

// Pi-only deprecations: keep files in repo for reference/tests, but do not deploy them.
const EXCLUDED_PI_EXTENSION_FILES = new Set([
    'main-guard.ts',
    'main-guard-post-push.ts',
]);

export async function copyExtraConfigs(srcDir: string, destDir: string): Promise<void> {
    for (const name of EXTRA_PI_CONFIGS) {
        const src = path.join(srcDir, name);
        const dest = path.join(destDir, name);
        if (await fs.pathExists(src) && !await fs.pathExists(dest)) {
            await fs.copy(src, dest);
        }
    }
}

export function fillTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}


export function readExistingPiValues(piAgentDir: string): Record<string, string> {
    const values: Record<string, string> = {};
    try {
        const auth = JSON.parse(require('fs').readFileSync(path.join(piAgentDir, 'auth.json'), 'utf8'));
        if (auth?.dashscope?.key) values['DASHSCOPE_API_KEY'] = auth.dashscope.key;
        if (auth?.zai?.key) values['ZAI_API_KEY'] = auth.zai.key;
    } catch { /* file doesn't exist or invalid */ }
    try {
        const models = JSON.parse(require('fs').readFileSync(path.join(piAgentDir, 'models.json'), 'utf8'));
        if (!values['DASHSCOPE_API_KEY'] && models?.providers?.dashscope?.apiKey) {
            values['DASHSCOPE_API_KEY'] = models.providers.dashscope.apiKey;
        }
    } catch { /* file doesn't exist or invalid */ }
    return values;
}

function isPiInstalled(): boolean {
    return spawnSync('pi', ['--version'], { encoding: 'utf8' }).status === 0;
}

function isExcludedPiExtensionRelPath(relPath: string): boolean {
    return EXCLUDED_PI_EXTENSION_FILES.has(path.basename(relPath));
}

async function listTsFilesRecursive(baseDir: string): Promise<string[]> {
    if (!await fs.pathExists(baseDir)) return [];

    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const abs = path.join(baseDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listTsFilesRecursive(abs));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.ts')) {
            const rel = path.relative(baseDir, abs);
            if (!isExcludedPiExtensionRelPath(rel)) files.push(abs);
        }
    }

    return files;
}

async function fileSha256(filePath: string): Promise<string> {
    const crypto = await import('node:crypto');
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

export async function diffPiExtensions(sourceDir: string, targetDir: string): Promise<PiExtensionDiff> {
    const sourceAbs = path.resolve(sourceDir);
    const targetAbs = path.resolve(targetDir);

    const sourceFiles = (await listTsFilesRecursive(sourceAbs)).map((f) => path.relative(sourceAbs, f)).sort();
    const missing: string[] = [];
    const stale: string[] = [];
    const upToDate: string[] = [];

    for (const rel of sourceFiles) {
        const src = path.join(sourceAbs, rel);
        const dst = path.join(targetAbs, rel);
        if (!await fs.pathExists(dst)) {
            missing.push(rel);
            continue;
        }

        const [srcHash, dstHash] = await Promise.all([fileSha256(src), fileSha256(dst)]);
        if (srcHash !== dstHash) stale.push(rel);
        else upToDate.push(rel);
    }

    return { missing, stale, upToDate };
}

function printPiCheckSummary(diff: PiExtensionDiff): void {
    const totalDiff = diff.missing.length + diff.stale.length;

    console.log(t.bold('\n  Pi extension drift check\n'));
    console.log(t.muted(`  Up-to-date: ${diff.upToDate.length}`));
    console.log(kleur.yellow(`  Missing:    ${diff.missing.length}`));
    console.log(kleur.yellow(`  Stale:      ${diff.stale.length}`));

    if (diff.missing.length > 0) {
        console.log(kleur.yellow('\n  Missing files:'));
        diff.missing.forEach((f) => console.log(kleur.yellow(`    - ${f}`)));
    }

    if (diff.stale.length > 0) {
        console.log(kleur.yellow('\n  Stale files:'));
        diff.stale.forEach((f) => console.log(kleur.yellow(`    - ${f}`)));
    }

    if (totalDiff === 0) {
        console.log(t.success('\n  ✓ Pi extensions are in sync\n'));
    }
}

export function createInstallPiCommand(): Command {
    const cmd = new Command('pi');
    cmd
        .description('Install Pi coding agent with providers, extensions, and npm packages')
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--check', 'Check Pi extension deployment drift without writing changes', false)
        .action(async (opts) => {
            const { yes, check } = opts;
            const repoRoot = await findRepoRoot();
            const piConfigDir = path.join(repoRoot, 'config', 'pi');

            if (check) {
                const sourceDir = path.join(piConfigDir, 'extensions');
                const targetDir = path.join(PI_AGENT_DIR, 'extensions');
                const diff = await diffPiExtensions(sourceDir, targetDir);
                printPiCheckSummary(diff);

                if (diff.missing.length > 0 || diff.stale.length > 0) {
                    console.error(kleur.red('  ✗ Pi extension drift detected. Run `xtrm install pi` to sync.\n'));
                    process.exit(1);
                }
                return;
            }

            console.log(t.bold('\n  Pi Coding Agent Setup\n'));

            if (!isPiInstalled()) {
                console.log(kleur.yellow('  pi not found — installing oh-pi globally...\n'));
                const r = spawnSync('npm', ['install', '-g', 'oh-pi'], { stdio: 'inherit' });
                if (r.status !== 0) {
                    console.error(kleur.red('\n  Failed to install oh-pi. Run: npm install -g oh-pi\n'));
                    process.exit(1);
                }
                console.log(t.success('  pi installed\n'));
            } else {
                const v = spawnSync('pi', ['--version'], { encoding: 'utf8' });
                console.log(t.success(`  pi ${v.stdout.trim()} already installed\n`));
            }

            const schema: InstallSchema = await fs.readJson(path.join(piConfigDir, 'install-schema.json'));
            const existing = readExistingPiValues(PI_AGENT_DIR);
            const values: Record<string, string> = { ...existing };

            console.log(t.bold('  API Keys\n'));
            for (const field of schema.fields) {
                if (existing[field.key]) {
                    console.log(t.success(`    ${sym.ok} ${field.label} [already set]`));
                    continue;
                }
                if (!field.required && !yes) {
                    const { include } = await prompts({ type: 'confirm', name: 'include', message: `  Configure ${field.label}? (optional)`, initial: false });
                    if (!include) continue;
                }
                const { value } = await prompts({ type: field.secret ? 'password' : 'text', name: 'value', message: `  ${field.label}`, hint: field.hint, validate: (v) => (field.required && !v) ? 'Required' : true });
                if (value) values[field.key] = value;
            }

            await fs.ensureDir(PI_AGENT_DIR);
            console.log(t.muted(`\n  Writing config to ${PI_AGENT_DIR}`));

            for (const name of ['models.json', 'auth.json', 'settings.json']) {
                const destPath = path.join(PI_AGENT_DIR, name);
                if (name === 'auth.json' && await fs.pathExists(destPath) && !yes) {
                    const { overwrite } = await prompts({ type: 'confirm', name: 'overwrite', message: `  ${name} already exists — overwrite? (OAuth tokens will be lost)`, initial: false });
                    if (!overwrite) { console.log(t.muted(`    skipped ${name}`)); continue; }
                }
                const raw = await fs.readFile(path.join(piConfigDir, `${name}.template`), 'utf8');
                await fs.writeFile(destPath, fillTemplate(raw, values), 'utf8');
                console.log(t.success(`    ${sym.ok} ${name}`));
            }

            await fs.copy(path.join(piConfigDir, 'extensions'), path.join(PI_AGENT_DIR, 'extensions'), {
                overwrite: true,
                filter: (srcPath: string) => {
                    const rel = path.relative(path.join(piConfigDir, 'extensions'), srcPath);
                    if (!rel || rel === '.') return true;
                    return !isExcludedPiExtensionRelPath(rel);
                },
            });
            console.log(t.success(`    ${sym.ok} extensions/`));

            console.log(t.bold('\n  npm Packages\n'));
            for (const pkg of schema.packages) {
                const r = spawnSync('pi', ['install', pkg], { stdio: 'inherit' });
                if (r.status === 0) console.log(t.success(`    ${sym.ok} ${pkg}`));
                else console.log(kleur.yellow(`    ${pkg} — failed, run manually: pi install ${pkg}`));
            }

            console.log(t.bold('\n  OAuth (manual steps)\n'));
            for (const provider of schema.oauth_providers) {
                console.log(t.muted(`    ${provider.key}: ${provider.instruction}`));
            }

            console.log(t.boldGreen('\n  Pi setup complete\n'));
        });
    return cmd;
}
