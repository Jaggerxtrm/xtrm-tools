import { Command } from 'commander';
import kleur from 'kleur';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import fs from 'fs-extra';
import { findRepoRoot } from '../utils/repo-root.js';
import { t } from '../utils/theme.js';
import { runPiInstall } from './pi-install.js';
import { ensureCorePackageSymlink, inventoryPiRuntime, remediateStalePiMcpAdapterOverride } from '../core/pi-runtime.js';
import { createInstallPiCommand } from './install-pi.js';
import { launchWorktreeSession } from '../utils/worktree-session.js';
import { confirmDestructiveAction } from '../utils/confirmation.js';

const PI_AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent');

interface PiProjectPointer {
    hasProjectExtensions: boolean;
    pointsToXtrmExtensions: boolean;
}

function resolveProjectRoot(): string {
    const gitResult = spawnSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe',
    });
    return gitResult.status === 0 ? (gitResult.stdout ?? '').trim() : process.cwd();
}

function hasSettingsEntry(entries: unknown, expectedEntry: string): boolean {
    if (!Array.isArray(entries)) return false;
    return entries.some((entry) => {
        if (typeof entry !== 'string') return false;
        return entry.replace(/\\/g, '/') === expectedEntry;
    });
}

async function getPiProjectPointer(projectRoot: string): Promise<PiProjectPointer> {
    const projectExtensionsDir = path.join(projectRoot, '.xtrm', 'extensions');
    const settingsPath = path.join(projectRoot, '.pi', 'settings.json');

    const hasProjectExtensions = await fs.pathExists(projectExtensionsDir);
    const hasSettingsFile = await fs.pathExists(settingsPath);

    if (!hasSettingsFile) {
        return { hasProjectExtensions, pointsToXtrmExtensions: false };
    }

    try {
        const settings = await fs.readJson(settingsPath) as { extensions?: unknown };
        return {
            hasProjectExtensions,
            pointsToXtrmExtensions: hasSettingsEntry(settings.extensions, '../.xtrm/extensions'),
        };
    } catch {
        return { hasProjectExtensions, pointsToXtrmExtensions: false };
    }
}

export function createPiCommand(): Command {
    const cmd = new Command('pi')
        .description('Launch a Pi session in a sandboxed worktree, or manage the Pi runtime')
        .argument('[name]', 'Optional session name — used as xt/<name> branch (random if omitted)')
        .action(async (name: string | undefined) => {
            await launchWorktreeSession({ runtime: 'pi', name });
        });

    // 'setup' = interactive first-time API key + OAuth config
    const piSetup = createInstallPiCommand();
    piSetup.name('setup');
    piSetup.description('Interactive first-time setup: API keys, config files, OAuth instructions');
    cmd.addCommand(piSetup);

    cmd.command('status')
        .description('Check Pi version and extension deployment drift')
        .action(async () => {
            console.log(t.bold('\n  Pi Runtime Status\n'));

            const piResult = spawnSync('pi', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
            if (piResult.status === 0) {
                console.log(t.success(`  ✓ pi ${piResult.stdout.trim()} installed`));
            } else {
                console.log(kleur.red('  ✗ pi not found — run: xt pi setup'));
                console.log('');
                return;
            }

            const projectRoot = resolveProjectRoot();
            const pointer = await getPiProjectPointer(projectRoot);

            const bundleRoot = await findRepoRoot();
            const sourceDir = path.join(bundleRoot, '.xtrm', 'extensions');
            const globalTargetDir = path.join(PI_AGENT_DIR, 'extensions');

            if (!await fs.pathExists(sourceDir)) {
                console.log(kleur.dim('  ○ managed extensions not bundled in this install\n'));
                return;
            }

            const plan = await inventoryPiRuntime(sourceDir, globalTargetDir);
            const pkgOk = plan.packages.filter(s => s.installed).length;

            if (pointer.hasProjectExtensions && pointer.pointsToXtrmExtensions) {
                console.log(kleur.dim('  Scope:      project'));
                console.log(kleur.dim('  Extensions: via .xtrm/extensions (.pi/settings.json)'));
            } else {
                console.log(kleur.dim('  Scope:      global'));
                const extOk = plan.extensions.filter(s => s.installed && !s.stale).length;
                console.log(kleur.dim(`  Extensions: ${extOk}/${plan.extensions.length} up-to-date`));
            }

            console.log(kleur.dim(`  Packages:   ${pkgOk}/${plan.packages.length} installed`));

            if (pointer.hasProjectExtensions && !pointer.pointsToXtrmExtensions) {
                console.log(kleur.yellow('  Settings:   .pi/settings.json is not pointing to ../.xtrm/extensions'));
            }

            if (plan.missingPackages.length > 0) {
                const names = plan.missingPackages.map(s => s.pkg.displayName).join(', ');
                console.log(kleur.yellow(`  Packages:   ${names}`));
            }

            if (!pointer.pointsToXtrmExtensions) {
                if (plan.missingExtensions.length > 0) {
                    const names = plan.missingExtensions.map(s => s.ext.displayName).join(', ');
                    console.log(kleur.yellow(`  Missing:    ${names}`));
                }
                if (plan.staleExtensions.length > 0) {
                    const names = plan.staleExtensions.map(s => s.ext.displayName).join(', ');
                    console.log(kleur.yellow(`  Stale:      ${names}`));
                }
                if (plan.orphanedExtensions.length > 0) {
                    console.log(kleur.red(`  Orphaned:   ${plan.orphanedExtensions.join(', ')}`));
                }
            }

            const projectModeOk = pointer.hasProjectExtensions ? pointer.pointsToXtrmExtensions : true;
            const hasGlobalDrift = !pointer.pointsToXtrmExtensions && !plan.allPresent;
            const hasPackageDrift = plan.missingPackages.length > 0;

            if (projectModeOk && !hasGlobalDrift && !hasPackageDrift) {
                console.log(t.success('\n  ✓ Pi runtime configuration looks healthy\n'));
                return;
            }

            console.log(kleur.dim('\n  → run: xt pi reload\n'));
        });

    cmd.command('doctor')
        .description('Diagnostic checks: pi installed, extensions deployed, packages present, orphaned extensions')
        .action(async () => {
            console.log(t.bold('\n  Pi Doctor\n'));

            let allOk = true;

            const piResult = spawnSync('pi', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
            if (piResult.status === 0) {
                console.log(t.success(`  ✓ pi ${piResult.stdout.trim()} installed`));
            } else {
                console.log(kleur.red('  ✗ pi not found — run: xt pi setup'));
                allOk = false;
            }

            const pnpmResult = spawnSync('pnpm', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
            if (pnpmResult.status === 0) {
                console.log(t.success(`  ✓ pnpm ${pnpmResult.stdout.trim()} installed`));
            } else {
                console.log(kleur.yellow('  ⚠ pnpm not found'));
                allOk = false;
            }

            const configFiles = ['models.json', 'auth.json', 'settings.json'];
            const missingConfig = configFiles.filter(f => !fs.existsSync(path.join(PI_AGENT_DIR, f)));
            if (missingConfig.length === 0) {
                console.log(t.success('  ✓ config files present'));
            } else {
                console.log(kleur.yellow(`  ⚠ missing config: ${missingConfig.join(', ')}`));
                allOk = false;
            }

            const projectRoot = resolveProjectRoot();
            const pointer = await getPiProjectPointer(projectRoot);
            const bundleRoot = await findRepoRoot();
            const sourceDir = path.join(bundleRoot, '.xtrm', 'extensions');
            const globalTargetDir = path.join(PI_AGENT_DIR, 'extensions');

            try {
                const staleOverride = await remediateStalePiMcpAdapterOverride(false);
                if (staleOverride.stale && staleOverride.remediated) {
                    console.log(t.success('  ✓ removed stale ~/.pi/agent/extensions/pi-mcp-adapter override'));
                } else if (staleOverride.stale) {
                    console.log(kleur.yellow('  ⚠ stale ~/.pi/agent/extensions/pi-mcp-adapter override detected'));
                    allOk = false;
                } else {
                    console.log(t.success('  ✓ pi-mcp-adapter override check passed'));
                }
            } catch (error) {
                console.log(kleur.yellow(`  ⚠ failed to remediate pi-mcp-adapter override: ${error}`));
                allOk = false;
            }

            try {
                const coreStatus = await ensureCorePackageSymlink(path.join(sourceDir, 'core'), projectRoot, false);
                if (coreStatus === 'repaired' || coreStatus === 'created') {
                    console.log(t.success('  ✓ repaired .xtrm/extensions/node_modules/@xtrm/pi-core symlink'));
                } else if (coreStatus === 'ok') {
                    console.log(t.success('  ✓ @xtrm/pi-core symlink is healthy'));
                } else if (coreStatus === 'missing-source') {
                    console.log(kleur.dim('  ○ @xtrm/pi-core source not bundled in this install'));
                }
            } catch (error) {
                console.log(kleur.yellow(`  ⚠ failed to ensure @xtrm/pi-core symlink: ${error}`));
                allOk = false;
            }

            if (!await fs.pathExists(sourceDir)) {
                console.log(kleur.dim('  ○ managed extensions not bundled in this install'));
            } else {
                const plan = await inventoryPiRuntime(sourceDir, globalTargetDir);

                if (pointer.hasProjectExtensions && pointer.pointsToXtrmExtensions) {
                    console.log(t.success('  ✓ project runtime points to .xtrm/extensions'));
                } else if (pointer.hasProjectExtensions) {
                    console.log(kleur.yellow('  ⚠ .pi/settings.json does not include ../.xtrm/extensions'));
                    allOk = false;
                } else if (plan.missingExtensions.length === 0 && plan.staleExtensions.length === 0 && plan.orphanedExtensions.length === 0) {
                    console.log(t.success(`  ✓ global extensions deployed (${plan.extensions.length})`));
                } else {
                    if (plan.missingExtensions.length > 0 || plan.staleExtensions.length > 0) {
                        console.log(kleur.yellow(`  ⚠ extension drift (${plan.missingExtensions.length} missing, ${plan.staleExtensions.length} stale)`));
                        allOk = false;
                    }
                    if (plan.orphanedExtensions.length > 0) {
                        console.log(kleur.red(`  ✗ orphaned extensions: ${plan.orphanedExtensions.join(', ')}`));
                        allOk = false;
                    }
                }

                if (plan.missingPackages.length === 0) {
                    console.log(t.success(`  ✓ packages installed (${plan.packages.length})`));
                } else {
                    console.log(kleur.yellow(`  ⚠ ${plan.missingPackages.length} package(s) missing`));
                    allOk = false;
                }
            }

            console.log('');
            if (allOk) {
                console.log(t.boldGreen('  ✓ All checks passed\n'));
            } else {
                console.log(kleur.yellow('  ⚠ Some checks failed — run: xt pi reload\n'));
            }
        });

    cmd.command('reload')
        .description('Re-sync extensions, remove orphaned, and reinstall missing packages')
        .option('-y, --yes', 'Skip confirmation prompt', false)
        .action(async (opts: { yes: boolean }) => {
            const confirmed = await confirmDestructiveAction({
                yes: opts.yes,
                message: 'Re-sync Pi runtime and remove orphaned extensions?',
                initial: true,
            });
            if (!confirmed) {
                console.log(kleur.dim('  Cancelled\n'));
                return;
            }

            await runPiInstall(false, false, resolveProjectRoot());
        });

    return cmd;
}
