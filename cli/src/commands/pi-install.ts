import kleur from 'kleur';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { t, sym } from '../utils/theme.js';
import { syncManagedPiExtensions, piPreCheck } from '../utils/pi-extensions.js';

// __dirname is available in CJS output (tsup target: cjs)

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
declare const __dirname: string;

const PI_AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent');

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

function isPiInstalled(): boolean {
    const r = spawnSync('pi', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
    return r.status === 0;
}

function isPnpmInstalled(): boolean {
    return spawnSync('pnpm', ['--version'], { encoding: 'utf8', stdio: 'pipe' }).status === 0;
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
    // Source always comes from xtrm-tools package (resolved via __dirname),
    // NOT from the user's project root (which has no config/pi/).
    const piConfigDir = path.join(resolvePkgRoot(), 'config', 'pi');
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
            console.log(kleur.dim('  [DRY RUN] npm install -g oh-pi'));
        }
        console.log(t.success('  ✓ pi installed'));
    } else {
        const v = spawnSync('pi', ['--version'], { encoding: 'utf8' });
        console.log(t.success(`  ✓ pi ${v.stdout.trim()} already installed`));
    }

    ensurePnpm(dryRun);

    // Load schema for packages
    let packages: string[] = [];
    if (await fs.pathExists(schemaPath)) {
        const schema: InstallSchema = await fs.readJson(schemaPath);
        packages = schema.packages;
    }

    // Run pre-check
    const extensionsSrc = path.join(piConfigDir, 'extensions');
    const extensionsDst = piExtensionsDir(isGlobal, projectRoot);

    const preCheck = await piPreCheck(extensionsSrc, extensionsDst, packages);

    // Print pre-check summary
    const extTotal = preCheck.extensions.missing.length + preCheck.extensions.stale.length + preCheck.extensions.upToDate.length;
    const pkgTotal = packages.length;

    console.log(kleur.dim(`\n  Pre-check:`));
    console.log(kleur.dim(`    Extensions: ${preCheck.extensions.upToDate.length}/${extTotal} up-to-date, ${preCheck.extensions.stale.length} stale, ${preCheck.extensions.missing.length} missing`));
    console.log(kleur.dim(`    Packages:   ${preCheck.packages.installed.length}/${pkgTotal} installed, ${preCheck.packages.needed.length} needed`));

    // Sync extensions (only missing + stale)
    await syncManagedPiExtensions({
        sourceDir: extensionsSrc,
        targetDir: extensionsDst,
        dryRun,
        log: (message) => console.log(kleur.dim(`    ${message}`)),
    });

    // For project-scoped installs, register extensions in .pi/settings.json.
    // Pi only auto-discovers from global ~/.pi/agent/extensions/ — for project-scoped
    // installs it reads ONLY from .pi/settings.json packages list.
    if (!isGlobal && projectRoot && !dryRun) {
        const piSettingsPath = path.join(projectRoot, '.pi', 'settings.json');
        let existingSettings: { packages?: string[] } = {};
        try {
            existingSettings = await fs.readJson(piSettingsPath);
        } catch { /* no existing settings — start fresh */ }

        // Collect all installed extension dirs
        const installedExtDirs: string[] = [];
        try {
            const entries = await fs.readdir(extensionsDst, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) installedExtDirs.push(entry.name);
            }
        } catch { /* extensionsDst may not exist yet */ }

        // Build new packages list: extension paths first (exclude 'core' - it's a library, not an extension)
        const extPaths = installedExtDirs
            .filter(name => name !== 'core')
            .map(name => `./extensions/${name}`);
        const nonExtPackages = (existingSettings.packages ?? []).filter(
            p => !p.startsWith('./extensions/') && !p.startsWith('../')
        );
        const updatedPackages = [...extPaths, ...nonExtPackages];

        await fs.ensureDir(path.join(projectRoot, '.pi'));
        await fs.writeJson(piSettingsPath, { ...existingSettings, packages: updatedPackages }, { spaces: 2 });
        console.log(kleur.dim(`    Updated .pi/settings.json with ${extPaths.length} extension(s)`));
    }

    // Install packages (only needed)
    if (packages.length > 0) {
        console.log(t.bold('\n  npm Packages'));

        if (preCheck.packages.needed.length === 0) {
            console.log(kleur.dim(`    ✓ All ${packages.length} packages already installed`));
        } else {
            for (const pkg of preCheck.packages.needed) {
                const installArgs = isGlobal ? ['install', pkg] : ['install', pkg, '-l'];
                if (dryRun) {
                    console.log(kleur.dim(`    [DRY RUN] pi ${installArgs.join(' ')}`));
                    continue;
                }
                const r = spawnSync('pi', installArgs, { stdio: 'pipe', encoding: 'utf8' });
                if (r.status === 0) {
                    console.log(t.success(`    ${sym.ok} ${pkg}`));
                } else {
                    console.log(kleur.yellow(`    ⚠ ${pkg} — install failed (run manually: pi install ${pkg})`));
                }
            }
        }
    }

    // Ensure @xtrm/pi-core is resolvable from node_modules (after npm install completes)
    if (!isGlobal && projectRoot) {
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