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

    it('xtrm install all prints deprecation notice', () => {
        const r = run(['install', 'all']);
        expect(r.stdout + r.stderr).toMatch(/deprecated/i);
    });

    it('xtrm install basic prints deprecation notice', () => {
        const r = run(['install', 'basic']);
        expect(r.stdout + r.stderr).toMatch(/deprecated/i);
    });

    it('xtrm install project exits with unknown command error', () => {
        const r = run(['install', 'project', 'something']);
        const combined = r.stdout + r.stderr;
        expect(combined.toLowerCase()).toMatch(/unknown command|error/);
    });

    it('xtrm project exits with unknown command error', () => {
        const r = run(['project', 'init']);
        const combined = r.stdout + r.stderr;
        expect(combined.toLowerCase()).toMatch(/unknown command|error/);
    });

    it('xtrm install --help does not describe all/basic as primary install subcommands', () => {
        const r = run(['install', '--help']);
        expect(r.stdout).not.toMatch(/install everything.*beads/i);
        expect(r.stdout).not.toMatch(/no beads gate/i);
    });

    it('xtrm install pi shows install help (pi is a target-selector, not a pi-runtime subcommand)', () => {
        // 'pi' is treated as a target-selector argument by the install command,
        // not as a pi-runtime management subcommand (that lives under xt pi install)
        const r = run(['install', 'pi', '--help']);
        expect(r.stdout).toMatch(/install/i);
        expect(r.stdout).not.toMatch(/launch.*pi.*session|worktree.*session/i);
    });

    it('xt pi install is registered under xt pi namespace', () => {
        const r = run(['pi', 'install', '--help']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/extension|package|install/i);
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
