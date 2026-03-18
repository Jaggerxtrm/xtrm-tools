import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOKS_DIR = path.join(ROOT, 'hooks');

function runHook(hookFile: string, input: Record<string, unknown>, env: Record<string, string> = {}) {
  return spawnSync('node', [path.join(HOOKS_DIR, hookFile)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function withFakeBdDir(scriptBody: string) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-fakebd-'));
  const fakeBdPath = path.join(tempDir, 'bd');
  writeFileSync(fakeBdPath, scriptBody, { encoding: 'utf8' });
  chmodSync(fakeBdPath, 0o755);
  return { tempDir, fakeBdPath };
}

describe('session-flow policy parity', () => {
  it('declares runtime:both with Claude hooks and Pi extension', () => {
    const policy = JSON.parse(readFileSync(path.join(ROOT, 'policies', 'session-flow.json'), 'utf8'));
    expect(policy.runtime).toBe('both');
    expect(policy.order).toBeLessThan(20); // must run before beads stop memory gate
    expect(policy.claude?.hooks?.length).toBeGreaterThan(0);
    expect(policy.pi?.extension).toBe('config/pi/extensions/session-flow.ts');
    expect(existsSync(path.join(ROOT, policy.pi.extension))).toBe(true);
  });

  it('compiled hooks run stop gate before memory gate', () => {
    const hooks = JSON.parse(readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
    const stopGroups = hooks?.hooks?.Stop ?? [];
    const commands: string[] = stopGroups.flatMap((g: any) => (g.hooks ?? []).map((h: any) => String(h.command)));
    const stopIdx = commands.findIndex((c) => c.includes('beads-stop-gate.mjs'));
    const memIdx = commands.findIndex((c) => c.includes('beads-memory-gate.mjs'));
    expect(stopIdx).toBeGreaterThanOrEqual(0);
    expect(memIdx).toBeGreaterThanOrEqual(0);
    expect(stopIdx).toBeLessThan(memIdx);
  });

  it('Claude stop hook enforces phase blocking contract', () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-session-flow-stop-'));
    mkdirSync(path.join(projectDir, '.beads'));

    const fake = withFakeBdDir(`#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "kv" && "$2" == "get" ]]; then exit 1; fi
if [[ "$1" == "list" ]]; then
  cat <<'EOF'

--------------------------------------------------------------------------------
Total: 0 issues (0 open, 0 in progress)
EOF
  exit 0
fi
exit 1
`);

    try {
      const cases = [
        { phase: 'waiting-merge', blocked: true },
        { phase: 'pending-cleanup', blocked: true },
        { phase: 'conflicting', blocked: true },
        { phase: 'cleanup-done', blocked: false },
      ];

      for (const c of cases) {
        writeFileSync(path.join(projectDir, '.xtrm-session-state.json'), JSON.stringify({
          issueId: 'jaggers-agent-tools-1xa2',
          branch: 'feature/jaggers-agent-tools-1xa2',
          worktreePath: '/tmp/worktrees/jaggers-agent-tools-1xa2',
          prNumber: 101,
          prUrl: 'https://example.invalid/pr/101',
          phase: c.phase,
          conflictFiles: c.phase === 'conflicting' ? ['src/a.ts'] : [],
          startedAt: new Date().toISOString(),
          lastChecked: new Date().toISOString(),
        }), 'utf8');

        const r = runHook(
          'beads-stop-gate.mjs',
          { hook_event_name: 'Stop', session_id: 'parity-session', cwd: projectDir },
          { PATH: `${fake.tempDir}:${process.env.PATH ?? ''}` },
        );

        if (c.blocked) {
          expect(r.status, `expected block for ${c.phase}`).toBe(2);
        } else {
          expect(r.status, `expected allow for ${c.phase}`).toBe(0);
        }
      }
    } finally {
      rmSync(fake.tempDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('Pi extension encodes same phase guards and claim detection semantics', () => {
    const src = readFileSync(path.join(ROOT, 'config', 'pi', 'extensions', 'session-flow.ts'), 'utf8');

    // claim detection path
    expect(src).toContain('bd\\s+update');
    expect(src).toContain('--claim');

    // phase parity with Claude stop-gate
    expect(src).toContain('waiting-merge');
    expect(src).toContain('pending-cleanup');
    expect(src).toContain('conflicting');
    expect(src).toContain('phase1-done');
    expect(src).toContain('xtrm finish');
  });
});
