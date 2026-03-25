import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import kleur from 'kleur';

// __dirname is available in CJS output (tsup target: cjs)
declare const __dirname: string;
let version = '0.0.0';
try { version = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')).version; } catch { /* fallback */ }

import { createInstallCommand } from './commands/install.js';
import { createClaudeCommand } from './commands/claude.js';
import { createPiCommand } from './commands/pi.js';
import { runProjectInit } from './commands/init.js';
import { createStatusCommand } from './commands/status.js';
import { createResetCommand } from './commands/reset.js';
import { createHelpCommand } from './commands/help.js';
import { createCleanCommand } from './commands/clean.js';
import { createEndCommand } from './commands/end.js';
import { createWorktreeCommand } from './commands/worktree.js';
import { createAttachCommand } from './commands/attach.js';
import { createDocsCommand } from './commands/docs.js';
import { createMemoryCommand } from './commands/memory.js';
import { createMergeCommand } from './commands/merge.js';
import { createDebugCommand } from './commands/debug.js';
import { printBanner } from './utils/banner.js';

const program = new Command();

program
    .name('xtrm')
    .description('Claude Code tools installer (skills, hooks, MCP servers)')
    .version(version);

// Add exit override for cleaner unknown command error
program.exitOverride((err) => {
    if (err.code === 'commander.unknownCommand') {
        console.error(kleur.red(`\n✗ Unknown command. Run 'xtrm --help'\n`));
        process.exit(1);
    }
    // Preserve exit code for help (0) and version (0); default to 1 for real errors
    process.exit(err.exitCode ?? 1);
});

// Main commands
program.addCommand(createInstallCommand());
program.addCommand(createClaudeCommand());
program.addCommand(createPiCommand());
program
    .command('init')
    .description('Alias for xtrm project init')
    .action(async () => {
        await runProjectInit();
    });
program.addCommand(createStatusCommand());
program.addCommand(createResetCommand());
program.addCommand(createCleanCommand());
program.addCommand(createEndCommand());
program.addCommand(createWorktreeCommand());
program.addCommand(createAttachCommand());
program.addCommand(createDocsCommand());
program.addCommand(createMemoryCommand());
program.addCommand(createMergeCommand());
program.addCommand(createDebugCommand());
program.addCommand(createHelpCommand());

// Default action: show help
program
    .action(async () => {
        program.help();
    });

// Global error handlers
process.on('uncaughtException', (err) => {
    if ((err as any).code?.startsWith('commander.')) {
        return;
    }
    console.error(kleur.red(`\n✗ ${err.message}\n`));
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error(kleur.red(`\n✗ ${String(reason)}\n`));
    process.exit(1);
});

// Show banner only for the install command (never for help/version output)
const isHelpOrVersion = process.argv.some(a => a === '--help' || a === '-h' || a === '--version' || a === '-V');
const isInstallCommand = (process.argv[2] ?? '') === 'install';

(async () => {
    if (!isHelpOrVersion && isInstallCommand) {
        await printBanner(version);
    }
    program.parseAsync(process.argv);
})();
