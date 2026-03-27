import { Command } from 'commander';

function section(title: string, lines: string[]): string {
    return [title, ...lines, ''].join('\n');
}

export function createHelpCommand(): Command {
    return new Command('help')
        .description('Show rich CLI help in a plain text format')
        .action(async () => {
            const blocks: string[] = [];

            blocks.push(section('XTRM CLI', [
                '  xtrm and xt are equivalent commands.',
                '  Use xt for short workflow commands (xt claude, xt pi, xt end).',
            ]));

            blocks.push(section('USAGE', [
                '  xtrm <command> [subcommand] [options]',
                '  xt <command> [subcommand] [options]',
            ]));

            blocks.push(section('CORE WORKFLOW', [
                '  1) Start a runtime session in a worktree:',
                '     xt claude [name]   or   xt pi [name]',
                '  2) Do your work in that worktree/branch.',
                '  3) If the session closes unexpectedly, re-attach:',
                '     xt attach [slug]',
                '  4) Publish that worktree with:',
                '     xt end',
                '  5) Optional follow-up operators:',
                '     xt memory update   (refresh .xtrm/memory.md from bd memories + repo state)',
                '     xt merge           (drain queued xt/* PRs oldest-first after CI passes)',
                '  6) Manage old worktrees when needed:',
                '     xt worktree list | xt worktree clean',
            ]));

            blocks.push(section('PRIMARY COMMANDS', [
                '  xtrm init [options]',
                '    Set up xtrm in this project (plugin, Pi, skills, beads, GitNexus).',
                '    Options: --dry-run, --yes/-y, --global',
                '',
                '  xtrm update',
                '    Reinstall and sync all tools to latest (alias: xtrm init --prune -y).',
                '',
                '  xtrm status [--json]',
                '    Show pending changes for detected environments.',
                '',
                '  xtrm clean [options]',
                '    Remove orphaned hooks/skills and stale hook wiring entries.',
                '    Options: --dry-run, --hooks-only, --skills-only, --yes/-y',
                '',
                '  xtrm init',
                '    Initialize project-level workflow setup.',
                '',
                '  xtrm docs --help',
                '    Documentation inspection and drift-check submenu.',
                '    Subcommands: show, list, cross-check',
                '',
                '  xtrm docs cross-check [--days <n>] [--json]',
                '    Validate docs against recent PR activity and closed bd issues.',
                '',
                '  xtrm memory update [--dry-run] [--no-beads]',
                '    Run memory-processor specialist to synthesize bd memories into .xtrm/memory.md.',
                '    --dry-run: classify and report without writing memory.md or pruning.',
                '',
                '  xtrm merge [--dry-run] [--no-beads]',
                '    Drain the xt worktree PR merge queue via the xt-merge specialist (FIFO, --rebase).',
                '    --dry-run: list queue and CI status without merging.',
                '',
                '  xtrm debug [options]',
                '    Stream xtrm event log (tool calls, gates, session/bd lifecycle).',
                '    Options: --follow, --all, --session <id>, --type <domain>, --json',
                '',
                '  xtrm reset',
                '    Clear saved CLI preferences.',
                '',
                '  xtrm help',
                '    Show this help page.',
            ]));

            blocks.push(section('RUNTIME COMMANDS', [
                '  xt claude [name]',
                '    Launch Claude in a sandboxed xt/<name> worktree.',
                '  xt claude install [--dry-run]',
                '    Install/refresh xtrm Claude plugin + official plugins.',
                '  xt claude status | xt claude doctor | xt claude reload',
                '',
                '  xt pi [name]',
                '    Launch Pi in a sandboxed xt/<name> worktree.',
                '  xt pi install [--dry-run]',
                '    Non-interactive extension sync + package install.',
                '  xt pi setup',
                '    Interactive first-time setup.',
                '  xt pi status | xt pi doctor | xt pi reload',
            ]));

            blocks.push(section('WORKTREE COMMANDS', [
                '  xt attach [slug]',
                '    Re-attach to an existing worktree and resume the Claude or Pi session.',
                '    Picks the most recent worktree if no slug is given; shows a picker when',
                '    multiple exist. Resumes with --continue (claude) or -c (pi).',
                '',
                '  xt worktree list',
                '    List active xt/* worktrees with runtime, last activity, last commit, and',
                '    a ready-to-run resume hint.',
                '  xt worktree clean [--yes/-y]',
                '    Remove worktrees already merged into main.',
                '  xt worktree remove <name> [--yes/-y]',
                '    Remove a specific xt worktree by name or path.',
            ]));

            blocks.push(section('SESSION CLOSE', [
                '  xt end [options]',
                '    Rebase to origin/main, push, open PR, link issues, and optionally clean worktree.',
                '    Options: --draft, --keep, --yes/-y',
                '',
                '  xt memory update [--dry-run] [--no-beads]',
                '    Run memory-processor to synthesize .xtrm/memory.md from bd memories + repo state.',
                '',
                '  xt merge [--dry-run] [--no-beads]',
                '    Run xt-merge to drain queued xt/* PRs FIFO: CI gate → rebase merge → rebase cascade.',
            ]));

            blocks.push(section('NOTES', [
                '  - Banner is shown for xtrm init and xtrm update.',
                '  - For command-level details, run: xtrm <command> --help',
                '  - For subcommand details, run: xtrm <command> <subcommand> --help',
                '  - For docs workflow details, run: xtrm docs --help',
            ]));

            process.stdout.write(blocks.join('\n'));
        });
}
