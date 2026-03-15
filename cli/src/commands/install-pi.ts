import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { findRepoRoot } from '../utils/repo-root.js';
import { t, sym } from '../utils/theme.js';

const PI_AGENT_DIR = path.join(homedir(), '.pi', 'agent');

interface SchemaField { key: string; label: string; hint: string; secret: boolean; required: boolean; }
interface OAuthProvider { key: string; instruction: string; }
interface InstallSchema { fields: SchemaField[]; oauth_providers: OAuthProvider[]; packages: string[]; }

export function fillTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}

function isPiInstalled(): boolean {
    return spawnSync('pi', ['--version'], { encoding: 'utf8' }).status === 0;
}

export function createInstallPiCommand(): Command {
    const cmd = new Command('pi');
    cmd
        .description('Install Pi coding agent with providers, extensions, and npm packages')
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .action(async (opts) => {
            const { yes } = opts;
            const repoRoot = await findRepoRoot();
            const piConfigDir = path.join(repoRoot, 'config', 'pi');

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
            const values: Record<string, string> = {};

            console.log(t.bold('  API Keys\n'));
            for (const field of schema.fields) {
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

            await fs.copy(path.join(piConfigDir, 'extensions'), path.join(PI_AGENT_DIR, 'extensions'), { overwrite: true });
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
