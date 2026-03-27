import { Command } from 'commander';
import kleur from 'kleur';
import path from 'path';
import { execSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import fs from 'fs-extra';
import { findRepoRoot } from '../utils/repo-root.js';
import { t } from '../utils/theme.js';
import { runPiInstall } from './pi-install.js';
import { diffPiExtensions } from '../utils/pi-extensions.js';
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
                console.log(kleur.red('  ✗ pi not found — run: xt pi install'));
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
            const diff = await diffPiExtensions(sourceDir, targetDir);

            if (diff.missing.length === 0 && diff.stale.length === 0) {
                console.log(t.success(`  ✓ extensions up-to-date (${diff.upToDate.length} deployed, ${scopeLabel})`));
            } else {
                if (diff.missing.length > 0) console.log(kleur.yellow(`  ⚠ missing: ${diff.missing.join(', ')}`));
                if (diff.stale.length > 0) console.log(kleur.yellow(`  ⚠ stale: ${diff.stale.join(', ')}`));
                console.log(kleur.dim('  → run: xt pi install'));
            }

            console.log('');
        });

    cmd.command('doctor')
        .description('Diagnostic checks: pi installed, extensions deployed, packages present')
        .action(async () => {
            console.log(t.bold('\n  Pi Doctor\n'));

            let allOk = true;

            const piResult = spawnSync('pi', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
            if (piResult.status === 0) {
                console.log(t.success(`  ✓ pi ${piResult.stdout.trim()} installed`));
            } else {
                console.log(kleur.red('  ✗ pi not found — run: xt pi install'));
                allOk = false;
            }

            const repoRoot = await findRepoRoot();
            const piConfigDir = path.join(repoRoot, 'config', 'pi');
            const sourceDir = path.join(piConfigDir, 'extensions');
            const projectScopedDir = path.join(repoRoot, '.pi', 'extensions');
            const targetDir = await fs.pathExists(projectScopedDir)
                ? projectScopedDir
                : path.join(PI_AGENT_DIR, 'extensions');
            const diff = await diffPiExtensions(sourceDir, targetDir);

            if (diff.missing.length === 0 && diff.stale.length === 0) {
                console.log(t.success(`  ✓ extensions deployed (${diff.upToDate.length})`));
            } else {
                console.log(kleur.yellow(`  ⚠ extension drift (${diff.missing.length} missing, ${diff.stale.length} stale)`));
                allOk = false;
            }

            const schemaPath = path.join(piConfigDir, 'install-schema.json');
            if (await fs.pathExists(schemaPath)) {
                try {
                    execSync('pi --version', { stdio: 'ignore' });
                    const schema = await fs.readJson(schemaPath);
                    const listResult = spawnSync('pi', ['list'], { encoding: 'utf8', stdio: 'pipe' });
                    const installed = listResult.stdout ?? '';
                    const missing = schema.packages.filter((p: string) => !installed.includes(p.replace('npm:', '')));
                    if (missing.length === 0) {
                        console.log(t.success(`  ✓ all ${schema.packages.length} packages installed`));
                    } else {
                        console.log(kleur.yellow(`  ⚠ ${missing.length} package(s) missing: ${missing.join(', ')}`));
                        allOk = false;
                    }
                } catch {
                    console.log(kleur.dim('  ○ could not check packages (pi not available)'));
                }
            }

            console.log('');
            if (allOk) {
                console.log(t.boldGreen('  ✓ All checks passed\n'));
            } else {
                console.log(kleur.yellow('  ⚠ Some checks failed — run: xt pi install\n'));
            }
        });

    cmd.command('reload')
        .description('Re-sync extensions and reinstall packages from repo')
        .action(async () => {
            await runPiInstall(false);
        });

    return cmd;
}
