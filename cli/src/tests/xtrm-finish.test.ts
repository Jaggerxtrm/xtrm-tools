import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { runXtrmFinish } from '../core/xtrm-finish.js';

function initRepo(dir: string) {
  spawnSync('git', ['init'], { cwd: dir, stdio: 'pipe' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'pipe' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: dir, stdio: 'pipe' });
  writeFileSync(path.join(dir, 'README.md'), '# test\n', 'utf8');
  spawnSync('git', ['add', 'README.md'], { cwd: dir, stdio: 'pipe' });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'pipe' });
}

describe('runXtrmFinish', () => {
  it('fails when session state file is missing', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-finish-none-'));
    try {
      const result = await runXtrmFinish({ cwd: dir, pollIntervalMs: 1, timeoutMs: 5 });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('.xtrm-session-state.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('re-entrant waiting-merge path reaches cleanup-done on merged PR', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-finish-merge-'));
    const fakeDir = path.join(dir, 'fakebin');
    mkdirSync(fakeDir, { recursive: true });
    initRepo(dir);

    writeFileSync(path.join(dir, '.xtrm-session-state.json'), JSON.stringify({
      issueId: 'jaggers-agent-tools-1xa2',
      branch: 'feature/jaggers-agent-tools-1xa2',
      worktreePath: '/tmp/nonexistent-worktree-path',
      prNumber: 42,
      prUrl: 'https://example.invalid/pr/42',
      phase: 'waiting-merge',
      conflictFiles: [],
      startedAt: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
    }), 'utf8');

    const ghPath = path.join(fakeDir, 'gh');
    writeFileSync(ghPath, `#!/usr/bin/env bash\nset -euo pipefail\nif [[ "$1" == "pr" && "$2" == "view" ]]; then\n  echo '{"state":"MERGED","mergeStateStatus":"CLEAN","mergeable":"MERGEABLE"}'\n  exit 0\nfi\nexit 1\n`);
    chmodSync(ghPath, 0o755);

    const oldPath = process.env.PATH;
    process.env.PATH = `${fakeDir}:${oldPath ?? ''}`;
    try {
      const result = await runXtrmFinish({ cwd: dir, pollIntervalMs: 1, timeoutMs: 20 });
      expect(result.ok).toBe(true);
      expect(result.message).toContain('merged');
      const state = JSON.parse(readFileSync(path.join(dir, '.xtrm-session-state.json'), 'utf8'));
      expect(state.phase).toBe('cleanup-done');
    } finally {
      process.env.PATH = oldPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sets pending-cleanup when PR is not merged before timeout', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-finish-timeout-'));
    const fakeDir = path.join(dir, 'fakebin');
    mkdirSync(fakeDir, { recursive: true });
    initRepo(dir);

    writeFileSync(path.join(dir, '.xtrm-session-state.json'), JSON.stringify({
      issueId: 'jaggers-agent-tools-1xa2',
      branch: 'feature/jaggers-agent-tools-1xa2',
      worktreePath: '/tmp/nonexistent-worktree-path',
      prNumber: 55,
      prUrl: 'https://example.invalid/pr/55',
      phase: 'waiting-merge',
      conflictFiles: [],
      startedAt: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
    }), 'utf8');

    const ghPath = path.join(fakeDir, 'gh');
    writeFileSync(ghPath, `#!/usr/bin/env bash\nset -euo pipefail\nif [[ "$1" == "pr" && "$2" == "view" ]]; then\n  echo '{"state":"OPEN","mergeStateStatus":"BLOCKED","mergeable":"UNKNOWN"}'\n  exit 0\nfi\nexit 1\n`);
    chmodSync(ghPath, 0o755);

    const oldPath = process.env.PATH;
    process.env.PATH = `${fakeDir}:${oldPath ?? ''}`;
    try {
      const result = await runXtrmFinish({ cwd: dir, pollIntervalMs: 1, timeoutMs: 10 });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Run xtrm finish when ready');
      const state = JSON.parse(readFileSync(path.join(dir, '.xtrm-session-state.json'), 'utf8'));
      expect(state.phase).toBe('pending-cleanup');
    } finally {
      process.env.PATH = oldPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
