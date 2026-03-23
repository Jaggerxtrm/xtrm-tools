import kleur from 'kleur';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { findRepoRoot } from '../utils/repo-root.js';
import { t, sym } from '../utils/theme.js';
import { syncManagedPiExtensions, piPreCheck, getInstalledPiPackages } from '../utils/pi-extensions.js';

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
    const extensionsDst = path.join(PI_AGENT_DIR, 'extensions');

    const preCheck = await piPreCheck(extensionsSrc, extensionsDst, packages);

    // Print pre-check summary
    const extTotal = preCheck.extensions.missing.length + preCheck.extensions.stale.length + preCheck.extensions.upToDate.length;
    const pkgTotal = packages.length;

    console.log(kleur.dim(`\n  Pre-check:`));
    console.log(kleur.dim(`    Extensions: ${preCheck.extensions.upToDate.length}/${extTotal} up-to-date, ${preCheck.extensions.stale.length} stale, ${preCheck.extensions.missing.length} missing`));
    console.log(kleur.dim(`    Packages:   ${preCheck.packages.installed.length}/${pkgTotal} installed, ${preCheck.packages.needed.length} needed`));

    // Sync extensions (only missing + stale)
    const managedPackages = await syncManagedPiExtensions({
        sourceDir: extensionsSrc,
        targetDir: extensionsDst,
        dryRun,
        log: (message) => console.log(kleur.dim(`    ${message}`)),
    });

    // Install packages (only needed)
    if (packages.length > 0) {
        console.log(t.bold('\n  npm Packages'));

        if (preCheck.packages.needed.length === 0) {
            console.log(kleur.dim(`    ✓ All ${packages.length} packages already installed`));
        } else {
            for (const pkg of preCheck.packages.needed) {
                if (dryRun) {
                    console.log(kleur.dim(`    [DRY RUN] pi install ${pkg}`));
                    continue;
                }
                const r = spawnSync('pi', ['install', pkg], { stdio: 'pipe', encoding: 'utf8' });
                if (r.status === 0) {
                    console.log(t.success(`    ${sym.ok} ${pkg}`));
                } else {
                    console.log(kleur.yellow(`    ⚠ ${pkg} — install failed (run manually: pi install ${pkg})`));
                }
            }
        }
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