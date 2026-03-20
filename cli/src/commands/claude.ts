import { Command } from 'commander';
import kleur from 'kleur';
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import { findRepoRoot } from '../utils/repo-root.js';
import { t } from '../utils/theme.js';
import { installPlugin } from './install.js';
import { launchWorktreeSession } from '../utils/worktree-session.js';

export function createClaudeCommand(): Command {
    const cmd = new Command('claude')
        .description('Launch a Claude session in a sandboxed worktree, or manage the Claude runtime')
        .argument('[name]', 'Optional session name — used as xt/<name> branch (random if omitted)')
        .action(async (name: string | undefined) => {
            await launchWorktreeSession({ runtime: 'claude', name });
        });

    cmd.command('install')
        .description('Install/refresh the xtrm-tools Claude plugin and official plugins')
        .option('--dry-run', 'Preview without making changes', false)
        .action(async (opts) => {
            const repoRoot = await findRepoRoot();
            await installPlugin(repoRoot, opts.dryRun);
        });

    cmd.command('reload')
        .alias('reinstall')
        .description('Reinstall Claude plugin from live repo (refreshes cached copy)')
        .action(async () => {
            const repoRoot = await findRepoRoot();
            await installPlugin(repoRoot, false);
        });

    cmd.command('status')
        .description('Show Claude CLI version, plugin status, and hook wiring')
        .action(async () => {
            console.log(t.bold('\n  Claude Code Status\n'));

            try {
                const version = execSync('claude --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
                console.log(t.success(`  ✓ claude CLI: ${version}`));
            } catch {
                console.log(kleur.red('  ✗ claude CLI not found'));
                console.log('');
                return;
            }

            const listResult = spawnSync('claude', ['plugin', 'list'], { encoding: 'utf8', stdio: 'pipe' });
            const pluginOutput = listResult.stdout ?? '';
            if (pluginOutput.includes('xtrm-tools')) {
                console.log(t.success('  ✓ xtrm-tools plugin installed'));
            } else {
                console.log(kleur.yellow('  ⚠ xtrm-tools plugin not installed — run: xt claude install'));
            }

            try {
                execSync('bd --version', { stdio: 'ignore' });
                console.log(t.success('  ✓ beads (bd) available'));
            } catch {
                console.log(kleur.dim('  ○ beads (bd) not installed'));
            }

            console.log('');
        });

    cmd.command('doctor')
        .description('Run diagnostic checks on Claude Code setup')
        .action(async () => {
            console.log(t.bold('\n  Claude Code Doctor\n'));

            let allOk = true;

            try {
                execSync('claude --version', { stdio: 'ignore' });
                console.log(t.success('  ✓ claude CLI available'));
            } catch {
                console.log(kleur.red('  ✗ claude CLI not found — install Claude Code'));
                allOk = false;
            }

            const listResult = spawnSync('claude', ['plugin', 'list'], { encoding: 'utf8', stdio: 'pipe' });
            if (listResult.stdout?.includes('xtrm-tools')) {
                console.log(t.success('  ✓ xtrm-tools plugin installed'));
            } else {
                console.log(kleur.yellow('  ⚠ xtrm-tools plugin missing — run: xt claude install'));
                allOk = false;
            }

            try {
                execSync('bd --version', { stdio: 'ignore' });
                console.log(t.success('  ✓ beads (bd) installed'));
            } catch {
                console.log(kleur.yellow('  ⚠ beads not installed — run: npm install -g @beads/bd'));
                allOk = false;
            }

            try {
                execSync('dolt version', { stdio: 'ignore' });
                console.log(t.success('  ✓ dolt installed'));
            } catch {
                console.log(kleur.yellow('  ⚠ dolt not installed — required for beads storage'));
                allOk = false;
            }

            try {
                execSync('gitnexus --version', { stdio: 'ignore' });
                console.log(t.success('  ✓ gitnexus installed'));
            } catch {
                console.log(kleur.dim('  ○ gitnexus not installed (optional) — npm install -g gitnexus'));
            }

            console.log('');
            if (allOk) {
                console.log(t.boldGreen('  ✓ All checks passed\n'));
            } else {
                console.log(kleur.yellow('  ⚠ Some checks failed — see above\n'));
            }
        });

    return cmd;
}
