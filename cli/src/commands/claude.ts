import { Command } from 'commander';
import kleur from 'kleur';
import { execSync, spawnSync } from 'node:child_process';
import { findRepoRoot } from '../utils/repo-root.js';
import { t } from '../utils/theme.js';
import { runClaudeRuntimeSyncPhase } from '../core/claude-runtime-sync.js';
import { launchWorktreeSession } from '../utils/worktree-session.js';
import { confirmDestructiveAction } from '../utils/confirmation.js';
import { inventoryDeps, renderBootstrapPlan } from '../core/machine-bootstrap.js';

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
        .option('-y, --yes', 'Skip confirmation prompt', false)
        .action(async (opts: { dryRun: boolean; yes: boolean }) => {
            if (!opts.dryRun) {
                const confirmed = await confirmDestructiveAction({
                    yes: opts.yes,
                    message: 'Sync Claude runtime and remove stale pre-plugin files?',
                    initial: true,
                });
                if (!confirmed) {
                    console.log(kleur.dim('  Cancelled\n'));
                    return;
                }
            }

            const repoRoot = await findRepoRoot();
            await runClaudeRuntimeSyncPhase({ repoRoot, dryRun: opts.dryRun, isGlobal: false });
        });

    cmd.command('reload')
        .alias('reinstall')
        .description('Reinstall Claude plugin from live repo (refreshes cached copy)')
        .option('-y, --yes', 'Skip confirmation prompt', false)
        .action(async (opts: { yes: boolean }) => {
            const confirmed = await confirmDestructiveAction({
                yes: opts.yes,
                message: 'Re-sync Claude runtime and remove stale pre-plugin files?',
                initial: true,
            });
            if (!confirmed) {
                console.log(kleur.dim('  Cancelled\n'));
                return;
            }

            const repoRoot = await findRepoRoot();
            await runClaudeRuntimeSyncPhase({ repoRoot, dryRun: false, isGlobal: false });
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

            // Managed dependencies — unified inventory
            const plan = inventoryDeps();
            renderBootstrapPlan(plan);

            if (!plan.allRequiredPresent) allOk = false;

            console.log('');
            if (allOk) {
                console.log(t.boldGreen('  ✓ All checks passed\n'));
            } else {
                console.log(kleur.yellow('  ⚠ Some checks failed — see above\n'));
            }
        });

    return cmd;
}
