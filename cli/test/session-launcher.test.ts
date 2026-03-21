import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.join(__dirname, '../dist/index.cjs');

function run(args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): { stdout: string; stderr: string; status: number } {
    const r = spawnSync('node', [CLI_BIN, ...args], {
        encoding: 'utf8',
        timeout: 15000,
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
    });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

function git(args: string[], cwd: string): void {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
}

function removeWorktree(wtPath: string, repoDir: string): void {
    spawnSync('git', ['worktree', 'remove', wtPath, '--force'], { cwd: repoDir, stdio: 'pipe' });
    try { fs.rmSync(wtPath, { recursive: true, force: true }); } catch { /* ignore */ }
}

let siblingBase: string;
let repoDir: string;

beforeAll(() => {
    siblingBase = fs.mkdtempSync(path.join(os.tmpdir(), 'xtrm-parent-'));
    repoDir = path.join(siblingBase, 'myproject');
    fs.mkdirSync(repoDir);
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test'], repoDir);
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# test');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'init'], repoDir);
});

afterAll(() => {
    try { fs.rmSync(siblingBase, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('session launcher CLI surface (2q8j)', () => {

    it('xt claude --help shows [name] as optional argument', () => {
        const r = run(['claude', '--help']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/\[name\]/);
    });

    it('xt pi --help shows [name] as optional argument', () => {
        const r = run(['pi', '--help']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/\[name\]/);
    });

    it('xt claude fails gracefully if claude binary not found', () => {
        const r = run(['claude'], {
            cwd: repoDir,
            env: { PATH: '/usr/bin:/bin' },
        });
        const combined = r.stdout + r.stderr;
        expect(combined).not.toMatch(/TypeError|ReferenceError|Cannot read properties/i);
    });

    it('xt pi fails gracefully if pi binary not found', () => {
        const r = run(['pi'], {
            cwd: repoDir,
            env: { PATH: '/usr/bin:/bin' },
        });
        const combined = r.stdout + r.stderr;
        expect(combined).not.toMatch(/TypeError|ReferenceError|Cannot read properties/i);
    });
});

describe('worktree creation naming convention (2q8j)', () => {

    it('creates worktree inside repo under .xtrm/worktrees/ with xt/<name> branch', () => {
        // Worktree lands at <repoDir>/.xtrm/worktrees/myproject-xt-claude-mysession
        const expectedPath = path.join(repoDir, '.xtrm', 'worktrees', 'myproject-xt-claude-mysession');

        if (fs.existsSync(expectedPath)) {
            removeWorktree(expectedPath, repoDir);
        }

        run(['claude', 'mysession'], { cwd: repoDir });

        expect(fs.existsSync(expectedPath)).toBe(true);

        const branchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: expectedPath, encoding: 'utf8', stdio: 'pipe',
        });
        expect(branchResult.stdout.trim()).toBe('xt/mysession');

        // Worktree is nested inside repoDir, not a sibling
        expect(expectedPath.startsWith(repoDir + path.sep)).toBe(true);

        removeWorktree(expectedPath, repoDir);
    });

    it('creates worktree with random xt/<slug> branch when no name provided', () => {
        // Worktree lands at <repoDir>/.xtrm/worktrees/myproject-xt-pi-<slug>
        const worktreesDir = path.join(repoDir, '.xtrm', 'worktrees');

        run(['pi'], { cwd: repoDir });

        // Find the created worktree (slug is random, so glob the dir)
        const entries = fs.existsSync(worktreesDir)
            ? fs.readdirSync(worktreesDir).filter(e => e.startsWith('myproject-xt-pi-'))
            : [];

        expect(entries.length).toBeGreaterThan(0);

        const wtPath = path.join(worktreesDir, entries[0]!);
        const branchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: wtPath, encoding: 'utf8', stdio: 'pipe',
        });
        expect(branchResult.stdout.trim()).toMatch(/^xt\/[a-z0-9]{4}$/);

        removeWorktree(wtPath, repoDir);
    });
});
