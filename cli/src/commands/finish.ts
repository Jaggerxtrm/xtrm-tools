import { Command } from 'commander';
import kleur from 'kleur';
import { runXtrmFinish } from '../core/xtrm-finish.js';

export function createFinishCommand(): Command {
  return new Command('finish')
    .description('Complete session closure lifecycle (phase1 + merge polling + cleanup)')
    .option('--poll-interval-ms <ms>', 'Polling interval for PR state checks', (v) => Number(v), 5000)
    .option('--timeout-ms <ms>', 'Maximum wait time before pending-cleanup', (v) => Number(v), 10 * 60 * 1000)
    .action(async (opts) => {
      const result = await runXtrmFinish({
        cwd: process.cwd(),
        pollIntervalMs: opts.pollIntervalMs,
        timeoutMs: opts.timeoutMs,
      });

      if (result.ok) {
        console.log(kleur.green(`\n✓ ${result.message}\n`));
        return;
      }

      console.error(kleur.red(`\n✗ ${result.message}\n`));
      process.exitCode = 1;
    });
}
