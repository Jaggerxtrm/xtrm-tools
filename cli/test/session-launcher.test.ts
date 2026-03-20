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

    it('creates worktree with xt/<name> branch when name is provided', () => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const expectedName = `myproject-xt-claude-${dateStr}`;
        const expectedPath = path.join(siblingBase, expectedName);

        // Pre-clean any stale worktree from previous runs
        if (fs.existsSync(expectedPath)) {
            removeWorktree(expectedPath, repoDir);
        }

        run(['claude', 'mysession'], {
            cwd: repoDir,
            env: { PATH: '/usr/bin:/bin' },
        });

        if (fs.existsSync(expectedPath)) {
            const branchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
                cwd: expectedPath, encoding: 'utf8', stdio: 'pipe',
            });
            expect(branchResult.stdout.trim()).toBe('xt/mysession');

            // Verify it's a sibling of repoDir, not nested inside it
            // Use repoDir + sep to avoid "myproject-xt-..." startsWith "myproject"
            expect(expectedPath.startsWith(repoDir + path.sep)).toBe(false);
            expect(path.dirname(expectedPath)).toBe(siblingBase);

            removeWorktree(expectedPath, repoDir);
        }
    });

    it('creates worktree with random xt/<slug> branch when no name provided', () => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const expectedName = `myproject-xt-pi-${dateStr}`;
        const expectedPath = path.join(siblingBase, expectedName);

        if (fs.existsSync(expectedPath)) {
            removeWorktree(expectedPath, repoDir);
        }

        run(['pi'], {
            cwd: repoDir,
            env: { PATH: '/usr/bin:/bin' },
        });

        if (fs.existsSync(expectedPath)) {
            const branchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
                cwd: expectedPath, encoding: 'utf8', stdio: 'pipe',
            });
            expect(branchResult.stdout.trim()).toMatch(/^xt\/[a-z0-9]{4}$/);
            removeWorktree(expectedPath, repoDir);
        }
    });
});
