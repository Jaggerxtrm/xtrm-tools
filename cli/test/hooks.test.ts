import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = path.join(__dirname, '../../hooks');

const CURRENT_BRANCH = (() => {
  try {
    return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  } catch {
    return 'main';
  }
})();

function runHook(
  hookFile: string,
  input: Record<string, unknown>,
  env: Record<string, string> = {},
) {
  return spawnSync('node', [path.join(HOOKS_DIR, hookFile)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// ── main-guard.mjs — MAIN_GUARD_PROTECTED_BRANCHES ──────────────────────────

describe('main-guard.mjs — MAIN_GUARD_PROTECTED_BRANCHES', () => {
  it('blocks Write when current branch is listed in MAIN_GUARD_PROTECTED_BRANCHES', () => {
    // Set env var to the actual current branch — without this env var the
    // hook only checks hardcoded main/master, so a feature branch always exits 0.
    const r = runHook(
      'main-guard.mjs',
      { tool_name: 'Write', tool_input: { file_path: '/tmp/x' } },
      { MAIN_GUARD_PROTECTED_BRANCHES: CURRENT_BRANCH },
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(CURRENT_BRANCH);
  });

  it('allows Write when current branch is NOT in MAIN_GUARD_PROTECTED_BRANCHES', () => {
    const r = runHook(
      'main-guard.mjs',
      { tool_name: 'Write', tool_input: { file_path: '/tmp/x' } },
      { MAIN_GUARD_PROTECTED_BRANCHES: 'nonexistent-branch-xyz' },
    );
    expect(r.status).toBe(0);
  });
});

// ── beads-gate-utils.mjs ─────────────────────────────────────────────────────

describe('beads-gate-utils.mjs — module integrity', () => {
  it('exports all required symbols without crashing', () => {
    const r = spawnSync('node', ['--input-type=module'], {
      input: `
import {
  resolveCwd, isBeadsProject, getSessionClaim,
  getTotalWork, getInProgress, clearSessionClaim, withSafeBdContext
} from '${HOOKS_DIR}/beads-gate-utils.mjs';
const ok = [resolveCwd, isBeadsProject, getSessionClaim, getTotalWork,
            getInProgress, clearSessionClaim, withSafeBdContext]
  .every(fn => typeof fn === 'function');
process.exit(ok ? 0 : 1);
`,
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
  });
});

// ── beads-edit-gate.mjs ───────────────────────────────────────────────────────

describe('beads-edit-gate.mjs', () => {
  it('fails open (exit 0) when no .beads directory exists', () => {
    const r = runHook('beads-edit-gate.mjs', {
      session_id: 'test-session',
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/x' },
      cwd: '/tmp',
    });
    expect(r.status).toBe(0);
  });

  it('imports from beads-gate-utils.mjs (no inline duplicate logic)', () => {
    const content = readFileSync(path.join(HOOKS_DIR, 'beads-edit-gate.mjs'), 'utf8');
    expect(content).toContain("from './beads-gate-utils.mjs'");
  });
});

// ── beads-stop-gate.mjs ───────────────────────────────────────────────────────

describe('beads-stop-gate.mjs', () => {
  it('fails open (exit 0) when no .beads directory exists', () => {
    const r = runHook('beads-stop-gate.mjs', { session_id: 'test', cwd: '/tmp' });
    expect(r.status).toBe(0);
  });

  it('imports from beads-gate-utils.mjs', () => {
    const content = readFileSync(path.join(HOOKS_DIR, 'beads-stop-gate.mjs'), 'utf8');
    expect(content).toContain("from './beads-gate-utils.mjs'");
  });
});

// ── beads-commit-gate.mjs ─────────────────────────────────────────────────────

describe('beads-commit-gate.mjs', () => {
  it('fails open (exit 0) when no .beads directory exists', () => {
    const r = runHook('beads-commit-gate.mjs', {
      session_id: 'test',
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m test' },
      cwd: '/tmp',
    });
    expect(r.status).toBe(0);
  });

  it('imports from beads-gate-utils.mjs', () => {
    const content = readFileSync(path.join(HOOKS_DIR, 'beads-commit-gate.mjs'), 'utf8');
    expect(content).toContain("from './beads-gate-utils.mjs'");
  });
});

// ── beads-close-memory-prompt.mjs ────────────────────────────────────────────

describe('beads-close-memory-prompt.mjs', () => {
  it('exits 0 for non-bd-close bash commands', () => {
    const r = runHook('beads-close-memory-prompt.mjs', {
      session_id: 'test',
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
      cwd: '/tmp',
    });
    expect(r.status).toBe(0);
  });

  it('imports from beads-gate-utils.mjs', () => {
    const content = readFileSync(path.join(HOOKS_DIR, 'beads-close-memory-prompt.mjs'), 'utf8');
    expect(content).toContain("from './beads-gate-utils.mjs'");
  });
});
