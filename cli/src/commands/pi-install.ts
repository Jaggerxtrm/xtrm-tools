import kleur from 'kleur';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { findRepoRoot } from '../utils/repo-root.js';
import { t, sym } from '../utils/theme.js';

const PI_AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent');

interface InstallSchema {
    fields: { key: string; label: string; hint: string; secret: boolean; required: boolean }[];
    oauth_providers: { key: string; instruction: string }[];
    packages: string[];
}

function isPiInstalled(): boolean {
    const r = spawnSync('pi', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
    return r.status === 0;
}

/**
 * List extension directories (contain package.json) in a base directory.
 */
async function listExtensionDirs(baseDir: string): Promise<string[]> {
    if (!await fs.pathExists(baseDir)) return [];
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const extDirs: string[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const extPath = path.join(baseDir, entry.name);
        const pkgPath = path.join(extPath, 'package.json');
        if (await fs.pathExists(pkgPath)) {
            extDirs.push(extPath);
        }
    }
    return extDirs;
}

/**
 * Non-interactive Pi install: copies extensions + installs npm packages.
 * Called automatically as part of `xtrm install`.
 */
export async function runPiInstall(dryRun: boolean = false): Promise<void> {
    const repoRoot = await findRepoRoot();
    const piConfigDir = path.join(repoRoot, 'config', 'pi');
    const schemaPath = path.join(piConfigDir, 'install-schema.json');

    console.log(t.bold('\n  ⚙  Pi extensions + packages'));

    if (!isPiInstalled()) {
        console.log(kleur.yellow('  pi not found — installing oh-pi globally...'));
        if (!dryRun) {
            const r = spawnSync('npm', ['install', '-g', 'oh-pi'], { stdio: 'inherit' });
            if (r.status !== 0) {
                console.error(kleur.red('  ✗ Failed to install oh-pi. Run: npm install -g oh-pi\n'));
                return;
            }
        } else {
            console.log(kleur.cyan('  [DRY RUN] npm install -g oh-pi'));
        }
        console.log(t.success('  ✓ pi installed'));
    } else {
        const v = spawnSync('pi', ['--version'], { encoding: 'utf8' });
        console.log(t.success(`  ✓ pi ${v.stdout.trim()} already installed`));
    }

    // Copy extensions
    const extensionsSrc = path.join(piConfigDir, 'extensions');
    const extensionsDst = path.join(PI_AGENT_DIR, 'extensions');
    if (await fs.pathExists(extensionsSrc)) {
        if (!dryRun) {
            await fs.ensureDir(PI_AGENT_DIR);
            await fs.copy(extensionsSrc, extensionsDst, { overwrite: true });
        }
        console.log(t.success(`  ${sym.ok} extensions synced`));

        // Register each extension with pi install -l
        const extDirs = await listExtensionDirs(extensionsDst);
        if (extDirs.length > 0) {
            console.log(kleur.dim(`  Registering ${extDirs.length} extensions...`));
            for (const extPath of extDirs) {
                const extName = path.basename(extPath);
                if (dryRun) {
                    console.log(kleur.cyan(`  [DRY RUN] pi install -l ~/.pi/agent/extensions/${extName}`));
                    continue;
                }
                const r = spawnSync('pi', ['install', '-l', extPath], { stdio: 'pipe', encoding: 'utf8' });
                if (r.status === 0) {
                    console.log(t.success(`  ${sym.ok} ${extName} registered`));
                } else {
                    console.log(kleur.yellow(`  ⚠ ${extName} — registration failed`));
                }
            }
        }
    }

    // Install npm packages from schema
    if (!(await fs.pathExists(schemaPath))) {
        console.log(kleur.dim('  No install-schema.json found, skipping packages'));
        return;
    }

    const schema: InstallSchema = await fs.readJson(schemaPath);
    for (const pkg of schema.packages) {
        if (dryRun) {
            console.log(kleur.cyan(`  [DRY RUN] pi install ${pkg}`));
            continue;
        }
        const r = spawnSync('pi', ['install', pkg], { stdio: 'pipe', encoding: 'utf8' });
        if (r.status === 0) {
            console.log(t.success(`  ${sym.ok} ${pkg}`));
        } else {
            console.log(kleur.yellow(`  ⚠ ${pkg} — install failed (run manually: pi install ${pkg})`));
        }
    }

    console.log('');
}
