import { Command } from 'commander';
import kleur from 'kleur';
import { spawn, spawnSync } from 'node:child_process';
import ora from 'ora';

export function createMergeCommand(): Command {
    return new Command('merge')
        .description('Drain the xt worktree PR merge queue via the xt-merge specialist')
        .option('--dry-run', 'List queue and CI status without merging', false)
        .option('--no-beads', 'Skip creating a tracking bead for this run', false)
        .option('--skip-ci', 'Skip local CI check before merging', false)
        .action(async (opts: { dryRun: boolean; beads: boolean; skipCi: boolean }) => {
            const cwd = process.cwd();

            // Run local CI first to catch failures early
            if (!opts.skipCi) {
                console.log(kleur.bold('\n  Running local CI...\n'));
                const localCi = spawnSync('make', ['ci'], { cwd, encoding: 'utf8', stdio: 'inherit' });
                if (localCi.status !== 0) {
                    console.error(kleur.red('\n  ✗ Local CI failed. Fix issues before merging.\n'));
                    process.exit(1);
                }
                console.log(kleur.green('\n  ✓ Local CI passed.\n'));
            }

            // Gate: specialists CLI must be available
            const check = spawnSync('specialists', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
            if (check.status !== 0) {
                console.error(kleur.red(
                    '\n  ✗ specialists CLI not found.\n' +
                    '  Install with: npm install -g @jaggerxtrm/specialists\n'
                ));
                process.exit(1);
            }

            // Gate: xt-merge specialist must be discovered
            const list = spawnSync('specialists', ['list', '--json'], { cwd, encoding: 'utf8', stdio: 'pipe' });
            if (list.status === 0) {
                try {
                    const specialists: Array<{ name: string }> = JSON.parse(list.stdout);
                    if (!specialists.some(s => s.name === 'xt-merge')) {
                        console.error(kleur.red(
                            '\n  ✗ xt-merge specialist not found.\n' +
                            '  Run `specialists init` to install canonical specialists.\n'
                        ));
                        process.exit(1);
                    }
                } catch { /* non-fatal: proceed and let specialists run handle it */ }
            }

            const prompt = opts.dryRun
                ? 'List all open xt/ PRs sorted by creation time and check CI status on each. Do not merge anything.'
                : 'Drain the xt worktree PR merge queue.';

            const args = ['run', 'xt-merge', '--prompt', prompt];
            if (!opts.beads) args.push('--no-beads');

            console.log(kleur.bold(`\n  xt merge${opts.dryRun ? ' (dry run)' : ''}\n`));

            const spinner = ora({
                text: opts.dryRun ? 'Checking PR queue...' : 'Merging PR queue...',
                color: 'cyan',
            }).start();
            const chunks: string[] = [];

            const exitCode = await new Promise<number>((resolve) => {
                const proc = spawn('specialists', args, { cwd, stdio: ['inherit', 'pipe', 'pipe'] });
                proc.stdout.on('data', (d: Buffer) => chunks.push(d.toString()));
                proc.stderr.on('data', (d: Buffer) => chunks.push(d.toString()));
                proc.on('close', (code) => resolve(code ?? 0));
            });

            if (exitCode === 0) {
                spinner.succeed(opts.dryRun ? 'Queue check complete.' : 'PR queue drained.');
            } else {
                spinner.fail('xt-merge failed.');
            }

            // Show the final output — last meaningful lines
            const lines = chunks.join('').split('\n').filter(l => l.trim());
            const tail = lines.slice(-10).map(l => kleur.dim('  ' + l)).join('\n');
            if (tail) console.log('\n' + tail + '\n');

            process.exit(exitCode);
        });
}
