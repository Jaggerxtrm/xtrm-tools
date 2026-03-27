import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.join(__dirname, '../dist/index.cjs');

function run(args: string[]): { stdout: string; stderr: string; status: number } {
    const r = spawnSync('node', [CLI_BIN, ...args], {
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env },
    });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

describe('install command surface (c1qd, j2jk, 6gpf, a875)', () => {

    it('xtrm install is no longer a registered command', () => {
        const r = run(['install']);
        expect(r.stdout + r.stderr).toMatch(/unknown command|error|too many/i);
    });

    it('xtrm project exits with unknown command error', () => {
        const r = run(['project', 'init']);
        const combined = r.stdout + r.stderr;
        expect(combined.toLowerCase()).toMatch(/unknown command|error/);
    });

    it('xt pi install is no longer a subcommand (handled by xtrm init)', () => {
        const r = run(['pi', '--help']);
        expect(r.stdout).not.toMatch(/^\s+install\b/im);
    });

    it('xtrm init is registered', () => {
        const r = run(['init', '--help']);
        expect(r.status).toBe(0);
    });

    it('xtrm --help does not mention gemini', () => {
        const r = run(['--help']);
        expect(r.stdout).not.toMatch(/gemini/i);
        expect(r.stdout).not.toMatch(/qwen/i);
    });
});
