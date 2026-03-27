import { Command } from 'commander';
import kleur from 'kleur';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function createMemoryCommand(): Command {
    return new Command('memory')
        .description('Manage project memory (.xtrm/memory.md)')
        .addCommand(createMemoryUpdateCommand());
}

function createMemoryUpdateCommand(): Command {
    return new Command('update')
        .description('Run memory-processor specialist to synthesize bd memories into .xtrm/memory.md')
        .option('--dry-run', 'Report only — do not modify memories or write memory.md', false)
        .option('--no-beads', 'Skip creating a tracking bead for this run', false)
        .action(async (opts: { dryRun: boolean; beads: boolean }) => {
            const cwd = process.cwd();

            // Gate: specialists CLI must be available
            const check = spawnSync('specialists', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
            if (check.status !== 0) {
                console.error(kleur.red(
                    '\n  ✗ specialists CLI not found.\n' +
                    '  Install with: npm install -g @jaggerxtrm/specialists\n'
                ));
                process.exit(1);
            }

            // Gate: memory-processor specialist must be discovered
            const list = spawnSync('specialists', ['list', '--json'], { cwd, encoding: 'utf8', stdio: 'pipe' });
            if (list.status === 0) {
                try {
                    const specialists: Array<{ name: string }> = JSON.parse(list.stdout);
                    if (!specialists.some(s => s.name === 'memory-processor')) {
                        console.error(kleur.red(
                            '\n  ✗ memory-processor specialist not found.\n' +
                            '  Run `specialists init` to install canonical specialists.\n'
                        ));
                        process.exit(1);
                    }
                } catch { /* non-fatal: proceed and let specialists run handle it */ }
            }

            const prompt = opts.dryRun
                ? 'Dry run: classify all memories and show the full report. Do not call bd forget or write .xtrm/memory.md.'
                : 'Run the full memory processor workflow.';

            const args = ['run', 'memory-processor', '--prompt', prompt];
            if (!opts.beads) args.push('--no-beads');

            const memPath = join(cwd, '.xtrm', 'memory.md');
            const spinnerText = opts.dryRun
                ? 'Analyzing memories...'
                : `${existsSync(memPath) ? 'Updating' : 'Creating'} .xtrm/memory.md...`;

            console.log(kleur.bold(`\n  xt memory update${opts.dryRun ? ' (dry run)' : ''}\n`));
            console.log(kleur.dim(`  ${spinnerText}\n`));

            // Pass stdio: 'inherit' so specialists gets a proper TTY — piping stdout causes
            // the specialists process to hang after job completion (it waits for TTY close).
            const exitCode = await new Promise<number>((resolve) => {
                const proc = spawn('specialists', args, { cwd, stdio: 'inherit' });
                proc.on('close', (code) => resolve(code ?? 0));
            });

            if (exitCode !== 0) {
                console.error(kleur.red('\n  ✗ memory-processor failed.\n'));
            }

            process.exit(exitCode);
        });
}
