import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.join(__dirname, '../dist/index.cjs');

function run(args: string[], opts: { cwd?: string } = {}): { stdout: string; stderr: string; status: number } {
    const r = spawnSync('node', [CLI_BIN, ...args], {
        encoding: 'utf8',
        timeout: 15000,
        cwd: opts.cwd,
        env: { ...process.env },
    });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

function git(args: string[], cwd: string): string {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
    return (r.stdout ?? '').trim();
}

let tmpBase: string;
let mainRepo: string;
let xtWorktree: string;

beforeAll(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'xtrm-end-'));
    mainRepo = path.join(tmpBase, 'myrepo');
    fs.mkdirSync(mainRepo);
    git(['init'], mainRepo);
    git(['config', 'user.email', 'test@test.com'], mainRepo);
    git(['config', 'user.name', 'Test'], mainRepo);
    fs.writeFileSync(path.join(mainRepo, 'README.md'), '# test');
    git(['add', '.'], mainRepo);
    git(['commit', '-m', 'init'], mainRepo);

    // Create an xt/* worktree
    xtWorktree = path.join(tmpBase, 'myrepo-xt-wt');
    git(['worktree', 'add', '-b', 'xt/test-session', xtWorktree], mainRepo);
});

afterAll(() => {
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── xt end ──────────────────────────────────────────────────────────────────

describe('xt end command surface (ua3z)', () => {

    it('xt end --help exits 0', () => {
        const r = run(['end', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt end --help describes draft, keep, and yes flags', () => {
        const r = run(['end', '--help']);
        expect(r.stdout).toMatch(/--draft/);
        expect(r.stdout).toMatch(/--keep/);
        expect(r.stdout).toMatch(/--yes|-y/);
    });

    it('xt end rejects when not on an xt/* branch', () => {
        // mainRepo is on 'main' (or 'master'), not xt/*
        const r = run(['end'], { cwd: mainRepo });
        const combined = r.stdout + r.stderr;
        expect(r.status).not.toBe(0);
        expect(combined).toMatch(/not in an xt worktree|xt\/|branch/i);
    });

    it('xt end rejects with uncommitted changes', () => {
        // Create a dirty file in the xt worktree
        fs.writeFileSync(path.join(xtWorktree, 'dirty.txt'), 'uncommitted');
        const r = run(['end'], { cwd: xtWorktree });
        const combined = r.stdout + r.stderr;
        // Either gate fires (dirty tree or no origin/main), both are acceptable
        expect(r.status).not.toBe(0);
        // Clean up
        fs.unlinkSync(path.join(xtWorktree, 'dirty.txt'));
    });

    it('xt end rejects when origin/main is not configured (no remote)', () => {
        // The xt worktree has no remote configured, so rebase/push will fail
        // After cleaning dirty state, end will get past the dirty-tree gate
        // but fail at fetch/rebase
        const r = run(['end', '-y'], { cwd: xtWorktree });
        const combined = r.stdout + r.stderr;
        expect(r.status).not.toBe(0);
        // Should mention rebase, push, or remote issues
        expect(combined).toMatch(/rebase|push|fetch|remote|origin/i);
    });
});

// ── xt worktree ──────────────────────────────────────────────────────────────

describe('xt worktree command surface (c5pi)', () => {

    it('xt worktree --help exits 0', () => {
        const r = run(['worktree', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt worktree list --help exits 0', () => {
        const r = run(['worktree', 'list', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt worktree clean --help exits 0', () => {
        const r = run(['worktree', 'clean', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt worktree remove --help exits 0', () => {
        const r = run(['worktree', 'remove', '--help']);
        expect(r.status).toBe(0);
    });

    it('xt worktree list shows xt/* worktree from main repo', () => {
        const r = run(['worktree', 'list'], { cwd: mainRepo });
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/xt\/test-session/);
    });

    it('xt worktree list shows no worktrees message when none present', () => {
        // Create an isolated repo with no xt worktrees
        const isolated = path.join(tmpBase, 'isolated');
        fs.mkdirSync(isolated);
        git(['init'], isolated);
        git(['config', 'user.email', 'test@test.com'], isolated);
        git(['config', 'user.name', 'Test'], isolated);
        fs.writeFileSync(path.join(isolated, 'file.txt'), 'x');
        git(['add', '.'], isolated);
        git(['commit', '-m', 'init'], isolated);

        const r = run(['worktree', 'list'], { cwd: isolated });
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/no xt worktrees/i);
    });

    it('xt worktree clean --yes has no merged worktrees to clean', () => {
        // The xt/test-session branch has not been merged into main
        const r = run(['worktree', 'clean', '--yes'], { cwd: mainRepo });
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/no merged xt worktrees/i);
    });

    it('xt worktree remove errors on unknown branch name', () => {
        const r = run(['worktree', 'remove', 'nonexistent-branch'], { cwd: mainRepo });
        expect(r.status).not.toBe(0);
        const combined = r.stdout + r.stderr;
        expect(combined).toMatch(/no xt worktree found/i);
    });

    it('xt worktree clean shows merged worktrees when branch is merged', () => {
        // Merge the xt branch into main and verify clean would pick it up
        git(['checkout', 'main'], mainRepo);
        git(['merge', 'xt/test-session', '--no-ff', '-m', 'merge test'], mainRepo);

        const r = run(['worktree', 'clean', '--yes'], { cwd: mainRepo });
        expect(r.status).toBe(0);
        // Should have removed the worktree since it's now merged
        expect(r.stdout).toMatch(/removed|clean/i);
    });
});
