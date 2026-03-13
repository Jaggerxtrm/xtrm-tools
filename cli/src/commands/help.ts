import { Command } from 'commander';
import kleur from 'kleur';

export function createHelpCommand(): Command {
    return new Command('help')
        .description('Show help information')
        .action(() => {
            console.log(`
${kleur.bold('XTRM - Claude Code Tools Installer')}

${kleur.cyan('USAGE:')}
  xtrm <command> [options]

${kleur.cyan('COMMANDS:')}

  ${kleur.bold('install')} [target-selector] [options]
    Install Claude Code tools (skills, hooks, MCP servers) to your environment.
    
    Options:
      --dry-run    Preview changes without making modifications
      -y, --yes    Skip confirmation prompts
      --prune      Remove items not in the canonical repository
      --backport   Backport drifted local changes to the repository
    
    Examples:
      xtrm install              # Interactive install with confirmation
      xtrm install all          # Install to all Claude Code targets without prompting
      xtrm install '*'          # Same as above; quote to avoid shell expansion
      xtrm install --dry-run    # Preview what would be installed
      xtrm install all --dry-run -y  # CI-friendly preview across all Claude targets
      xtrm install -y           # Non-interactive install

  ${kleur.bold('install project')} <tool-name>
    Install a project-specific skill package into the current project.
    
    This command installs modular tools (like tdd-guard, ts-quality-gate, etc.)
    into your project's .claude/ directory with proper hook injection.
    
    Examples:
      xtrm install project tdd-guard       # Install TDD Guard
      xtrm install project ts-quality-gate # Install TypeScript Quality Gate
      xtrm install project all             # Install every available project skill
      xtrm install project '*'             # Same as above; quote to avoid shell expansion

  ${kleur.bold('install project list')}
    List all available project skills with descriptions and usage examples.
    
    Shows a table of installable project-specific tools that can enhance
    Claude's capabilities for your specific project needs.

  ${kleur.bold('status')}
    Show diff of pending changes without making modifications.
    
    Displays what skills, hooks, and config would be updated if you ran
    'xtrm install'. Useful for reviewing changes before applying them.

  ${kleur.bold('reset')}
    Clear saved preferences (sync mode, target selections, etc.).
    
    Use this to reset the CLI configuration and start fresh.

${kleur.cyan('PROJECT SKILLS:')}

  Project skills are modular, plug-and-play tool packages that extend
  Claude's capabilities for specific workflows. Each skill includes:
  
  • Pre-configured hooks for Claude Code
  • Skills to provide context and guidance
  • Documentation for manual setup steps
  
  Available project skills:
  • ${kleur.white('service-skills-set')} — Docker service expertise (SessionStart, PreToolUse, PostToolUse)
  • ${kleur.white('tdd-guard')} — Enforce Test-Driven Development (PreToolUse, UserPromptSubmit)
  • ${kleur.white('ts-quality-gate')} — TypeScript/ESLint/Prettier quality gate (PostToolUse)
  • ${kleur.white('py-quality-gate')} — Python ruff/mypy quality gate (PostToolUse)
  • ${kleur.white('main-guard')} — Git branch protection (PreToolUse)

${kleur.cyan('INSTALL TARGETS:')}

  xtrm-tools v2.0.0 installs into Claude Code targets and the .agents/skills cache:
  • ~/.claude
  • %APPDATA%/Claude on Windows
  • ~/.agents/skills (skills-only copy)

${kleur.cyan('ARCHITECTURE:')}

  xtrm-tools v2.0.0 supports Claude Code exclusively. This decision was made
  to focus on providing a robust, well-tested installation engine rather than
  maintaining fragile translations for unofficial hook ecosystems.
  
  For Gemini CLI or Qwen CLI, users must manually configure their environments.
  See the repository README for manual setup instructions.

${kleur.cyan('RESOURCES:')}

  • Repository: https://github.com/Jaggerxtrm/xtrm-tools
  • Documentation: See README.md in the repository
  • Report Issues: https://github.com/Jaggerxtrm/xtrm-tools/issues

${kleur.dim('Run \'xtrm <command> --help\' for more information on a specific command.')}
`);
        });
}
