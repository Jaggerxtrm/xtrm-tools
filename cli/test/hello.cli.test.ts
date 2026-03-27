import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.join(__dirname, '../dist/index.cjs');

function run(args: string[]): { stdout: string; stderr: string; status: number } {
    const r = spawnSync('node', [CLI_BIN, ...args], { encoding: 'utf8', timeout: 10000 });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

describe('xtrm hello (xtrm-wdt7.4)', () => {
    it('outputs exactly "Hello\\n"', () => {
        const r = run(['hello']);
        expect(r.stdout).toBe('Hello\n');
    });

    it('exits with code 0', () => {
        const r = run(['hello']);
        expect(r.status).toBe(0);
    });

    it('appears in xtrm --help', () => {
        const r = run(['--help']);
        expect(r.stdout).toMatch(/hello/);
    });
});
