import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import os from 'node:os';
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

function parseHookJson(stdout: string) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function withFakeBdDir(scriptBody: string) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-fakebd-'));
  const fakeBdPath = path.join(tempDir, 'bd');
  writeFileSync(fakeBdPath, scriptBody, { encoding: 'utf8' });
  chmodSync(fakeBdPath, 0o755);
  return { tempDir, fakeBdPath };
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
    expect(r.status).toBe(0);
    const out = parseHookJson(r.stdout);
    expect(out?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(out?.systemMessage).toContain(CURRENT_BRANCH);
  });

  it('allows Write when current branch is NOT in MAIN_GUARD_PROTECTED_BRANCHES', () => {
    const r = runHook(
      'main-guard.mjs',
      { tool_name: 'Write', tool_input: { file_path: '/tmp/x' } },
      { MAIN_GUARD_PROTECTED_BRANCHES: 'nonexistent-branch-xyz' },
    );
    expect(r.status).toBe(0);
  });

  it('blocks Bash by default on protected branch (default-deny)', () => {
    const r = runHook(
      'main-guard.mjs',
      { tool_name: 'Bash', tool_input: { command: 'cat > file.txt << EOF\nhello\nEOF' } },
      { MAIN_GUARD_PROTECTED_BRANCHES: CURRENT_BRANCH },
    );
    expect(r.status).toBe(0);
    const out = parseHookJson(r.stdout);
    expect(out?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(out?.systemMessage).toContain('Bash is restricted');
  });

  it('allows safe Bash commands on protected branch', () => {
    const safeCommands = [
      'git status',
      'git log --oneline -5',
      'git diff HEAD',
      'git checkout -b feature/x',
      'git switch -c feature/y',
      'git fetch origin',
      'git pull',
      'gh pr list',
      'bd list',
    ];
    for (const command of safeCommands) {
      const r = runHook(
        'main-guard.mjs',
        { tool_name: 'Bash', tool_input: { command } },
        { MAIN_GUARD_PROTECTED_BRANCHES: CURRENT_BRANCH },
      );
      expect(r.status, `expected exit 0 for: ${command}`).toBe(0);
    }
  });

  it('blocks mutating checkout forms on protected branch', () => {
    const blockedCommands = [
      'git checkout -- README.md',
      'git checkout HEAD -- README.md',
      'git switch --detach HEAD',
    ];
    for (const command of blockedCommands) {
      const r = runHook(
        'main-guard.mjs',
        { tool_name: 'Bash', tool_input: { command } },
        { MAIN_GUARD_PROTECTED_BRANCHES: CURRENT_BRANCH },
      );
      expect(r.status, `expected structured deny for: ${command}`).toBe(0);
      const out = parseHookJson(r.stdout);
      expect(out?.hookSpecificOutput?.permissionDecision).toBe('deny');
      expect(out?.systemMessage).toContain('Bash is restricted');
    }
  });

  it('allows Bash when MAIN_GUARD_ALLOW_BASH=1 is set', () => {
    const r = runHook(
      'main-guard.mjs',
      { tool_name: 'Bash', tool_input: { command: 'npm run build' } },
      { MAIN_GUARD_PROTECTED_BRANCHES: CURRENT_BRANCH, MAIN_GUARD_ALLOW_BASH: '1' },
    );
    expect(r.status).toBe(0);
  });

  it('blocks git commit in Bash with workflow guidance', () => {
    const r = runHook(
      'main-guard.mjs',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "oops"' } },
      { MAIN_GUARD_PROTECTED_BRANCHES: CURRENT_BRANCH },
    );
    expect(r.status).toBe(0);
    const out = parseHookJson(r.stdout);
    expect(out?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(out?.systemMessage).toContain('feature branch');
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

  it('blocks when session has no claim but open issues exist (regression guard)', () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-beads-project-'));
    mkdirSync(path.join(projectDir, '.beads'));
    const fake = withFakeBdDir(`#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "kv" && "$2" == "get" ]]; then
  exit 1
fi
if [[ "$1" == "list" ]]; then
  cat <<'EOF'
○ issue-1 P2 Open issue

--------------------------------------------------------------------------------
Total: 1 issues (1 open, 0 in progress)
EOF
  exit 0
fi
exit 1
`);

    try {
      const r = runHook(
        'beads-edit-gate.mjs',
        {
          session_id: 'session-regression-test',
          tool_name: 'Write',
          tool_input: { file_path: '/tmp/x' },
          cwd: projectDir,
        },
        { PATH: `${fake.tempDir}:${process.env.PATH ?? ''}` },
      );
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('no active claim');
    } finally {
      rmSync(fake.tempDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
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
