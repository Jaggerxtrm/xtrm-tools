import { Command } from 'commander';
import kleur from 'kleur';
import { resetContext } from '../core/context.js';
import { confirmDestructiveAction } from '../utils/confirmation.js';

export function createResetCommand(): Command {
    return new Command('reset')
        .description('Reset CLI configuration (clears saved sync mode and preferences)')
        .option('-y, --yes', 'Skip confirmation prompt', false)
        .action(async (opts: { yes: boolean }) => {
            const confirmed = await confirmDestructiveAction({
                yes: opts.yes,
                message: 'Reset saved CLI configuration?',
                initial: false,
            });
            if (!confirmed) {
                console.log(kleur.dim('  Cancelled\n'));
                return;
            }

            resetContext();
            console.log(kleur.green('✓ Configuration reset. Run sync again to reconfigure.'));
        });
}
