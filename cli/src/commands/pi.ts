import { Command } from 'commander';
import kleur from 'kleur';
import path from 'path';
import { execSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import fs from 'fs-extra';
import { findRepoRoot } from '../utils/repo-root.js';
import { t } from '../utils/theme.js';
import { runPiInstall } from './pi-install.js';
import { inventoryPiRuntime, renderPiRuntimePlan } from '../core/pi-runtime.js';
import { createInstallPiCommand } from './install-pi.js';
import { launchWorktreeSession } from '../utils/worktree-session.js';

const PI_AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent');

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

            const repoRoot = await findRepoRoot();
            const sourceDir = path.join(repoRoot, 'config', 'pi', 'extensions');
            const projectScopedDir = path.join(repoRoot, '.pi', 'extensions');
            const targetDir = await fs.pathExists(projectScopedDir)
                ? projectScopedDir
                : path.join(PI_AGENT_DIR, 'extensions');
            const scopeLabel = targetDir === projectScopedDir ? 'project' : 'global';

            if (!await fs.pathExists(sourceDir)) {
                console.log(kleur.dim(`  ○ managed extensions not bundled in this install\n`));
                return;
            }

            const plan = await inventoryPiRuntime(sourceDir, targetDir);

            // Summary line
            const extOk = plan.extensions.filter(s => s.installed && !s.stale).length;
            const pkgOk = plan.packages.filter(s => s.installed).length;

            console.log(kleur.dim(`  Scope:      ${scopeLabel}`));
            console.log(kleur.dim(`  Extensions: ${extOk}/${plan.extensions.length} up-to-date`));
            console.log(kleur.dim(`  Packages:   ${pkgOk}/${plan.packages.length} installed`));

            if (plan.allPresent) {
                console.log(t.success(`\n  ✓ All extensions and packages present\n`));
            } else {
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
                if (plan.missingPackages.length > 0) {
                    const names = plan.missingPackages.map(s => s.pkg.displayName).join(', ');
                    console.log(kleur.yellow(`  Packages:   ${names}`));
                }
                console.log(kleur.dim('\n  → run: xt pi reload\n'));
            }
        });

    cmd.command('doctor')
        .description('Diagnostic checks: pi installed, extensions deployed, packages present, orphaned extensions')
        .action(async () => {
            console.log(t.bold('\n  Pi Doctor\n'));

            let allOk = true;

            // Check pi binary
            const piResult = spawnSync('pi', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
            if (piResult.status === 0) {
                console.log(t.success(`  ✓ pi ${piResult.stdout.trim()} installed`));
            } else {
                console.log(kleur.red('  ✗ pi not found — run: xt pi setup'));
                allOk = false;
            }

            // Check pnpm
            const pnpmResult = spawnSync('pnpm', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
            if (pnpmResult.status === 0) {
                console.log(t.success(`  ✓ pnpm ${pnpmResult.stdout.trim()} installed`));
            } else {
                console.log(kleur.yellow('  ⚠ pnpm not found'));
                allOk = false;
            }

            // Check config files
            const configFiles = ['models.json', 'auth.json', 'settings.json'];
            const missingConfig = configFiles.filter(f => !fs.existsSync(path.join(PI_AGENT_DIR, f)));
            if (missingConfig.length === 0) {
                console.log(t.success(`  ✓ config files present`));
            } else {
                console.log(kleur.yellow(`  ⚠ missing config: ${missingConfig.join(', ')}`));
                allOk = false;
            }

            // Check extensions and packages using unified service
            const repoRoot = await findRepoRoot();
            const sourceDir = path.join(repoRoot, 'config', 'pi', 'extensions');
            const projectScopedDir = path.join(repoRoot, '.pi', 'extensions');
            const targetDir = await fs.pathExists(projectScopedDir)
                ? projectScopedDir
                : path.join(PI_AGENT_DIR, 'extensions');

            if (await fs.pathExists(sourceDir)) {
                const plan = await inventoryPiRuntime(sourceDir, targetDir);

                if (plan.allPresent) {
                    console.log(t.success(`  ✓ extensions deployed (${plan.extensions.length})`));
                    console.log(t.success(`  ✓ packages installed (${plan.packages.length})`));
                } else {
                    if (plan.missingExtensions.length > 0 || plan.staleExtensions.length > 0) {
                        console.log(kleur.yellow(`  ⚠ extension drift (${plan.missingExtensions.length} missing, ${plan.staleExtensions.length} stale)`));
                        allOk = false;
                    }
                    if (plan.orphanedExtensions.length > 0) {
                        console.log(kleur.red(`  ✗ orphaned extensions: ${plan.orphanedExtensions.join(', ')}`));
                        allOk = false;
                    }
                    if (plan.missingPackages.length > 0) {
                        console.log(kleur.yellow(`  ⚠ ${plan.missingPackages.length} package(s) missing`));
                        allOk = false;
                    }
                }
            } else {
                console.log(kleur.dim('  ○ managed extensions not bundled in this install'));
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
        .action(async () => {
            const repoRoot = await findRepoRoot();
            await runPiInstall(false, false, repoRoot);
        });

    return cmd;
}
