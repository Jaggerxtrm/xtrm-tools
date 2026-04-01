import { Command } from 'commander';
import kleur from 'kleur';
import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import { findRepoRoot } from '../utils/repo-root.js';
import { t } from '../utils/theme.js';
import { runClaudeRuntimeSyncPhase } from '../core/claude-runtime-sync.js';
import { launchWorktreeSession } from '../utils/worktree-session.js';
import { confirmDestructiveAction } from '../utils/confirmation.js';
import { inventoryDeps, renderBootstrapPlan } from '../core/machine-bootstrap.js';

function getProjectSettingsPath(repoRoot: string): string {
    return path.join(repoRoot, '.claude', 'settings.json');
}

function hasXtrmHookWiring(settingsPath: string): boolean {
    if (!fs.existsSync(settingsPath)) return false;

    try {
        const data = fs.readJsonSync(settingsPath) as {
            hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
        };

        const groups = Object.values(data.hooks ?? {});
        for (const wrappers of groups) {
            for (const wrapper of wrappers) {
                for (const hook of wrapper.hooks ?? []) {
                    if (typeof hook.command === 'string' && hook.command.includes('.xtrm/hooks/')) {
                        return true;
                    }
                }
            }
        }
        return false;
    } catch {
        return false;
    }
}

export function createClaudeCommand(): Command {
    const cmd = new Command('claude')
        .description('Launch a Claude session in a sandboxed worktree, or manage Claude hook wiring')
        .argument('[name]', 'Optional session name — used as xt/<name> branch (random if omitted)')
        .action(async (name: string | undefined) => {
            await launchWorktreeSession({ runtime: 'claude', name });
        });

    cmd.command('install')
        .description('Install/refresh Claude settings hook wiring from .xtrm/config/hooks.json')
        .option('--dry-run', 'Preview without making changes', false)
        .option('-y, --yes', 'Skip confirmation prompt', false)
        .action(async (opts: { dryRun: boolean; yes: boolean }) => {
            if (!opts.dryRun) {
                const confirmed = await confirmDestructiveAction({
                    yes: opts.yes,
                    message: 'Sync Claude hooks into settings.json?',
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
        .description('Re-sync Claude settings hook wiring from the current repo')
        .option('-y, --yes', 'Skip confirmation prompt', false)
        .action(async (opts: { yes: boolean }) => {
            const confirmed = await confirmDestructiveAction({
                yes: opts.yes,
                message: 'Re-sync Claude hooks into settings.json?',
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
        .description('Show Claude CLI version and .xtrm hook wiring status')
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

            const repoRoot = await findRepoRoot();
            const settingsPath = getProjectSettingsPath(repoRoot);
            if (hasXtrmHookWiring(settingsPath)) {
                console.log(t.success(`  ✓ Claude hooks wired (${settingsPath})`));
            } else {
                console.log(kleur.yellow('  ⚠ .xtrm hook wiring missing — run: xt claude install'));
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

            const repoRoot = await findRepoRoot();
            const settingsPath = getProjectSettingsPath(repoRoot);
            if (hasXtrmHookWiring(settingsPath)) {
                console.log(t.success('  ✓ .xtrm hooks are wired in .claude/settings.json'));
            } else {
                console.log(kleur.yellow('  ⚠ .xtrm hooks not wired — run: xt claude install'));
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
