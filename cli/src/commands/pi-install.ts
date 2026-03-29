/**
 * Non-interactive Pi install command.
 *
 * Called automatically as part of `xtrm install` and `xtrm init`.
 * Delegates to the unified pi-runtime service.
 *
 * @see cli/src/core/pi-runtime.ts
 */

import kleur from 'kleur';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { t, sym } from '../utils/theme.js';
import { runPiRuntimeSync } from '../core/pi-runtime.js';
import { isPiInstalled, isPnpmInstalled } from '../core/machine-bootstrap.js';

// __dirname is available in CJS output (tsup target: cjs)
declare const __dirname: string;

const PI_AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent');

/**
 * Ensure @xtrm/pi-core is resolvable from .pi/npm/node_modules.
 * Creates a symlink: .pi/npm/node_modules/@xtrm/pi-core -> ../../extensions/core
 */
async function ensureCorePackageSymlink(extensionsDst: string, projectRoot: string, dryRun: boolean): Promise<void> {
    const coreDir = path.join(extensionsDst, 'core');
    if (!await fs.pathExists(coreDir)) return; // core not synced yet

    const nodeModulesDir = path.join(projectRoot, '.pi', 'node_modules', '@xtrm');
    const symlinkPath = path.join(nodeModulesDir, 'pi-core');

    if (await fs.pathExists(symlinkPath)) return; // already exists

    if (dryRun) {
        console.log(kleur.dim(`    [DRY RUN] would create @xtrm/pi-core symlink`));
        return;
    }

    await fs.ensureDir(nodeModulesDir);
    // Relative path: .pi/node_modules/@xtrm/pi-core -> ../../extensions/core
    await fs.symlink('../../extensions/core', symlinkPath);
    console.log(kleur.dim(`    Created @xtrm/pi-core symlink for module resolution`));
}

/**
 * Resolve the xtrm-tools package root from __dirname.
 * cli/dist/ -> ../.. = package root.
 * Falls back to checking one level higher for global npm installs.
 */
function resolvePkgRoot(): string {
    const candidates = [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../..'),
    ];
    for (const c of candidates) {
        if (require('fs').existsSync(path.join(c, 'config', 'pi', 'extensions'))) return c;
    }
    return candidates[0];
}

function piExtensionsDir(isGlobal: boolean, projectRoot?: string): string {
    if (!isGlobal && projectRoot) {
        return path.join(projectRoot, '.pi', 'extensions');
    }
    return path.join(PI_AGENT_DIR, 'extensions');
}

interface InstallSchema {
    fields: { key: string; label: string; hint: string; secret: boolean; required: boolean }[];
    oauth_providers: { key: string; instruction: string }[];
    packages: string[];
}

function ensurePnpm(dryRun: boolean): void {
    if (isPnpmInstalled()) {
        const v = spawnSync('pnpm', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
        console.log(t.success(`  ✓ pnpm ${v.stdout.trim()} already installed`));
        return;
    }
    console.log(kleur.yellow('  pnpm not found — installing via npm...'));
    if (dryRun) {
        console.log(kleur.dim('  [DRY RUN] npm install -g pnpm'));
        return;
    }
    const r = spawnSync('npm', ['install', '-g', 'pnpm'], { stdio: 'inherit' });
    if (r.status !== 0) {
        console.log(kleur.yellow('  ⚠ Failed to install pnpm. Run: npm install -g pnpm'));
    } else {
        console.log(t.success('  ✓ pnpm installed'));
    }
}

/**
 * Non-interactive Pi install: copies extensions + installs npm packages.
 * Called automatically as part of `xtrm install`.
 *
 * @param isGlobal - When true, installs to global Pi dirs (~/.pi/agent/). Default false = project-scoped.
 * @param projectRoot - Project root for project-scoped installs. Defaults to findRepoRoot().
 */
export async function runPiInstall(dryRun: boolean = false, isGlobal: boolean = false, projectRoot?: string): Promise<void> {
    if (!projectRoot) {
        const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
            cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe',
        });
        projectRoot = r.status === 0 ? (r.stdout ?? '').trim() : process.cwd();
    }

    console.log(t.bold('\n  ⚙  Pi extensions + packages'));

    // Ensure pi and pnpm are installed
    if (!isPiInstalled()) {
        console.log(kleur.yellow('  pi not found — installing oh-pi globally...'));
        if (!dryRun) {
            const r = spawnSync('npm', ['install', '-g', 'oh-pi'], { stdio: 'inherit' });
            if (r.status !== 0) {
                console.error(kleur.red('  ✗ Failed to install oh-pi. Run: npm install -g oh-pi\n'));
                return;
            }
        } else {
            console.log(kleur.dim('  [DRY RUN] npm install -g oh-pi'));
        }
        console.log(t.success('  ✓ pi installed'));
    } else {
        const v = spawnSync('pi', ['--version'], { encoding: 'utf8' });
        console.log(t.success(`  ✓ pi ${v.stdout.trim()} already installed`));
    }

    ensurePnpm(dryRun);

    // Run unified sync
    await runPiRuntimeSync({ dryRun, isGlobal, projectRoot });

    // Ensure @xtrm/pi-core is resolvable from node_modules (project-scoped only)
    const piConfigDir = path.join(resolvePkgRoot(), 'config', 'pi');
    const hasManagedExtensions = await fs.pathExists(piConfigDir);

    if (hasManagedExtensions && !isGlobal && projectRoot) {
        const extensionsDst = piExtensionsDir(isGlobal, projectRoot);
        await ensureCorePackageSymlink(extensionsDst, projectRoot, dryRun);
    }

    // Detect unconfigured Pi — nudge to run setup
    const configFiles = ['models.json', 'auth.json', 'settings.json'];
    const missingConfig = configFiles.filter(f => !require('fs').existsSync(path.join(PI_AGENT_DIR, f)));
    if (missingConfig.length > 0) {
        console.log(kleur.yellow(`\n  ⚠ Pi is not fully configured (missing: ${missingConfig.join(', ')})`));
        console.log(kleur.yellow('    Run: xt pi setup   to complete first-time configuration'));
        console.log(kleur.dim('    (API keys, model defaults, OAuth providers)\n'));
    } else {
        console.log('');
    }
}
