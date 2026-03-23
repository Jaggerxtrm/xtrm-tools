import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.join(__dirname, '../dist/index.cjs');

function run(args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): { stdout: string; stderr: string; status: number } {
    const r = spawnSync('node', [CLI_BIN, ...args], {
        encoding: 'utf8',
        timeout: 20000,
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
    });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

function git(args: string[], cwd: string): string {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
    return (r.stdout ?? '').trim();
}

describe('xt end dry-run autonomy heuristics', () => {
    it('synthesizes a non-generic title from changed files when no bead metadata is available', () => {
        const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'xtrm-end-autonomy-'));
        const remote = path.join(tmpBase, 'remote.git');
        const mainRepo = path.join(tmpBase, 'repo');
        const xtWorktree = path.join(tmpBase, 'repo-xt');

        try {
            git(['init', '--bare', remote], tmpBase);

            fs.mkdirSync(mainRepo);
            git(['init', '-b', 'main'], mainRepo);
            git(['config', 'user.email', 'test@test.com'], mainRepo);
            git(['config', 'user.name', 'Test'], mainRepo);
            git(['remote', 'add', 'origin', remote], mainRepo);

            fs.mkdirSync(path.join(mainRepo, 'cli', 'src', 'commands'), { recursive: true });
            fs.mkdirSync(path.join(mainRepo, 'docs'), { recursive: true });
            fs.writeFileSync(path.join(mainRepo, 'README.md'), '# test');
            fs.writeFileSync(path.join(mainRepo, 'cli', 'src', 'commands', 'docs.ts'), 'export const docs = 1;\n');
            git(['add', '.'], mainRepo);
            git(['commit', '-m', 'init'], mainRepo);
            git(['push', '-u', 'origin', 'main'], mainRepo);

            git(['worktree', 'add', '-b', 'xt/test-autonomy', xtWorktree], mainRepo);
            fs.mkdirSync(path.join(xtWorktree, 'cli', 'src', 'commands'), { recursive: true });
            fs.mkdirSync(path.join(xtWorktree, 'docs'), { recursive: true });
            fs.writeFileSync(path.join(xtWorktree, 'cli', 'src', 'commands', 'docs-cross-check-gh.ts'), 'export const gh = 1;\n');
            fs.writeFileSync(path.join(xtWorktree, 'docs', 'docs-commands.md'), '# docs commands\n');
            git(['add', '.'], xtWorktree);
            git(['commit', '-m', 'Implement docs flow (xtrm-skg2)'], xtWorktree);

            const r = run(['end', '--dry-run'], { cwd: xtWorktree });
            const combined = r.stdout + r.stderr;

            expect(r.status).toBe(0);
            expect(combined).not.toMatch(/Title:\s+session changes/i);
            expect(combined).toMatch(/Title:\s+.+/i);
            expect(combined).toMatch(/xtrm-skg2/i);
        } finally {
            try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    it('recognizes dotted issue ids from commit messages in dry-run output', () => {
        const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'xtrm-end-dotted-'));
        const remote = path.join(tmpBase, 'remote.git');
        const mainRepo = path.join(tmpBase, 'repo');
        const xtWorktree = path.join(tmpBase, 'repo-xt');

        try {
            git(['init', '--bare', remote], tmpBase);

            fs.mkdirSync(mainRepo);
            git(['init', '-b', 'main'], mainRepo);
            git(['config', 'user.email', 'test@test.com'], mainRepo);
            git(['config', 'user.name', 'Test'], mainRepo);
            git(['remote', 'add', 'origin', remote], mainRepo);
            fs.writeFileSync(path.join(mainRepo, 'README.md'), '# test');
            git(['add', '.'], mainRepo);
            git(['commit', '-m', 'init'], mainRepo);
            git(['push', '-u', 'origin', 'main'], mainRepo);

            git(['worktree', 'add', '-b', 'xt/test-dotted', xtWorktree], mainRepo);
            fs.writeFileSync(path.join(xtWorktree, 'README.md'), '# changed\n');
            git(['add', 'README.md'], xtWorktree);
            git(['commit', '-m', 'Add tests (8jr5.8)'], xtWorktree);

            const r = run(['end', '--dry-run'], { cwd: xtWorktree });
            const combined = r.stdout + r.stderr;

            expect(r.status).toBe(0);
            expect(combined).toMatch(/8jr5\.8/);
        } finally {
            try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });
});
