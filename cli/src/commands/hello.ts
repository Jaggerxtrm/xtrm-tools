import { Command } from 'commander';

export function createHelloCommand(): Command {
    return new Command('hello')
        .description('Print Hello and exit')
        .action(() => {
            process.stdout.write('Hello\n');
        });
}
