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

describe('xt claude runtime subcommands (bjvn)', () => {

    it('xt claude --help lists subcommands', () => {
        const r = run(['claude', '--help']);
        expect(r.status).toBe(0);
        const out = r.stdout;
        expect(out).toMatch(/install/);
        expect(out).toMatch(/reload/);
        expect(out).toMatch(/status/);
        expect(out).toMatch(/doctor/);
    });

    it('xt claude install --help exits 0', () => {
        const r = run(['claude', 'install', '--help']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/install|plugin/i);
    });

    it('xt claude install --dry-run exits without error', () => {
        const r = run(['claude', 'install', '--dry-run']);
        // dry-run may fail if repo root can't be found in test env, but should not crash
        const combined = r.stdout + r.stderr;
        expect(combined).not.toMatch(/TypeError|ReferenceError|Cannot read/i);
    });

    it('xt claude reload --help exits 0', () => {
        const r = run(['claude', 'reload', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt claude status --help exits 0', () => {
        const r = run(['claude', 'status', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt claude doctor --help exits 0', () => {
        const r = run(['claude', 'doctor', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt claude is described as session launcher with worktree', () => {
        const r = run(['claude', '--help']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/session|worktree/i);
    });
});

describe('xt pi runtime subcommands (bjvn)', () => {

    it('xt pi --help lists subcommands', () => {
        const r = run(['pi', '--help']);
        expect(r.status).toBe(0);
        const out = r.stdout;
        expect(out).toMatch(/install/);
        expect(out).toMatch(/setup/);
        expect(out).toMatch(/status/);
        expect(out).toMatch(/doctor/);
        expect(out).toMatch(/reload/);
    });

    it('xt pi install --help exits 0', () => {
        const r = run(['pi', 'install', '--help']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/install|extension|package/i);
    });

    it('xt pi setup --help exits 0', () => {
        const r = run(['pi', 'setup', '--help']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/setup|api|key|interactive/i);
    });

    it('xt pi status --help exits 0', () => {
        const r = run(['pi', 'status', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt pi doctor --help exits 0', () => {
        const r = run(['pi', 'doctor', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt pi reload --help exits 0', () => {
        const r = run(['pi', 'reload', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt pi is described as session launcher with worktree', () => {
        const r = run(['pi', '--help']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/session|worktree/i);
    });

    it('xt pi install is under the pi namespace (not xtrm install)', () => {
        // xt install treats "pi" as a target-selector (not a pi runtime subcommand)
        // The install command help should NOT mention pi runtime management
        const r = run(['install', 'pi', '--help']);
        expect(r.stdout).not.toMatch(/launch.*pi.*session|worktree.*session/i);
        // xt pi install --help IS the pi runtime install
        const r2 = run(['pi', 'install', '--help']);
        expect(r2.status).toBe(0);
        expect(r2.stdout).toMatch(/extension|package|install/i);
    });
});
