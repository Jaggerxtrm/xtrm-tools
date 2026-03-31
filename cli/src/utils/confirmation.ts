import kleur from 'kleur';
import prompts from 'prompts';

interface DestructiveConfirmationOptions {
    yes?: boolean;
    message: string;
    initial?: boolean;
}

function hasInteractiveTTY(): boolean {
    return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

function isTestRuntime(): boolean {
    return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
}

export async function confirmDestructiveAction(opts: DestructiveConfirmationOptions): Promise<boolean> {
    if (opts.yes) return true;

    if (!hasInteractiveTTY() && !isTestRuntime()) {
        console.error(kleur.red(
            '\n  ✗ Destructive command requires confirmation in interactive mode.\n' +
            '  Re-run with --yes to allow non-interactive execution.\n',
        ));
        return false;
    }

    const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: opts.message,
        initial: opts.initial ?? false,
    });

    return Boolean(confirm);
}
