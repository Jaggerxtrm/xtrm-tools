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
  cwd?: string,
) {
  return spawnSync('node', [path.join(HOOKS_DIR, hookFile)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd,
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
    const r = runHook(
      'main-guard.mjs',
      { tool_name: 'Write', tool_input: { file_path: '/tmp/x' } },
      { MAIN_GUARD_PROTECTED_BRANCHES: CURRENT_BRANCH },
    );
    expect(r.status).toBe(2);
    const out = parseHookJson(r.stdout);
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
    expect(r.status).toBe(2);
    const out = parseHookJson(r.stdout);
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
      expect(r.status, `expected exit 2 for: ${command}`).toBe(2);
      const out = parseHookJson(r.stdout);
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
    expect(r.status).toBe(2);
    const out = parseHookJson(r.stdout);
    expect(out?.systemMessage).toContain('feature branch');
  });
});

// ── main-guard-post-push.mjs ────────────────────────────────────────────────

describe('main-guard-post-push.mjs', () => {
  function createTempGitRepo(branch: string): string {
    const repoDir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-post-push-'));
    spawnSync('git', ['init'], { cwd: repoDir, stdio: 'pipe' });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir, stdio: 'pipe' });
    spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir, stdio: 'pipe' });
    writeFileSync(path.join(repoDir, 'README.md'), '# test\n', 'utf8');
    spawnSync('git', ['add', 'README.md'], { cwd: repoDir, stdio: 'pipe' });
    spawnSync('git', ['commit', '-m', 'init'], { cwd: repoDir, stdio: 'pipe' });
    const current = spawnSync('git', ['branch', '--show-current'], { cwd: repoDir, encoding: 'utf8', stdio: 'pipe' }).stdout.trim();
    if (current !== branch) {
      spawnSync('git', ['checkout', '-B', branch], { cwd: repoDir, stdio: 'pipe' });
    }
    return repoDir;
  }

  it('injects PR workflow reminder after successful feature-branch push command', () => {
    const repoDir = createTempGitRepo('feature/test-push');
    try {
      const r = runHook(
        'main-guard-post-push.mjs',
        { tool_name: 'Bash', tool_input: { command: 'git push -u origin feature/test-push' }, cwd: repoDir },
        { MAIN_GUARD_PROTECTED_BRANCHES: 'main,master' },
        repoDir,
      );
      expect(r.status).toBe(0);
      const out = parseHookJson(r.stdout);
      expect(out?.systemMessage).toContain('gh pr create --fill');
      expect(out?.systemMessage).toContain('gh pr merge --squash');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('does not emit reminder for non-push Bash commands', () => {
    const repoDir = createTempGitRepo('feature/test-nopush');
    try {
      const r = runHook(
        'main-guard-post-push.mjs',
        { tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: repoDir },
        { MAIN_GUARD_PROTECTED_BRANCHES: 'main,master' },
        repoDir,
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('does not emit reminder when current branch is protected', () => {
    const repoDir = createTempGitRepo('main');
    try {
      const r = runHook(
        'main-guard-post-push.mjs',
        { tool_name: 'Bash', tool_input: { command: 'git push -u origin main' }, cwd: repoDir },
        { MAIN_GUARD_PROTECTED_BRANCHES: 'main,master' },
        repoDir,
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('does not emit reminder when push command reports failure', () => {
    const repoDir = createTempGitRepo('feature/test-failed-push');
    try {
      const r = runHook(
        'main-guard-post-push.mjs',
        {
          tool_name: 'Bash',
          tool_input: { command: 'git push -u origin feature/test-failed-push' },
          tool_response: { exit_code: 1, stderr: 'remote rejected' },
          cwd: repoDir,
        },
        { MAIN_GUARD_PROTECTED_BRANCHES: 'main,master' },
        repoDir,
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
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

  it('allows stop (exit 0) when session has a stale claim but no in_progress issues', () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-beads-stopgate-'));
    mkdirSync(path.join(projectDir, '.beads'));
    const fake = withFakeBdDir(`#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "kv" && "$2" == "get" ]]; then
  echo "jaggers-stale-claim"
  exit 0
fi
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
      const r = runHook(
        'beads-stop-gate.mjs',
        { session_id: 'session-stale-claim', cwd: projectDir },
        { PATH: `${fake.tempDir}:${process.env.PATH ?? ''}` },
      );
      expect(r.status).toBe(0);
    } finally {
      rmSync(fake.tempDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});


// ── tdd-guard-pretool-bridge.cjs ─────────────────────────────────────────────

const TDD_BRIDGE_DIR = path.join(__dirname, '../../project-skills/tdd-guard/.claude/hooks');

describe('tdd-guard-pretool-bridge.cjs', () => {
  it('does not forward tdd-guard stderr when stdout already contains the message', () => {
    const fakeDir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-fake-tddguard-'));
    const fakeBin = path.join(fakeDir, 'tdd-guard');
    // Simulate tdd-guard writing the same message to both stdout and stderr (the bug)
    writeFileSync(fakeBin, `#!/usr/bin/env bash\nMSG='{"reason":"Premature implementation"}'\necho "$MSG"\necho "$MSG" >&2\nexit 2\n`, { encoding: 'utf8' });
    chmodSync(fakeBin, 0o755);

    try {
      const r = spawnSync('node', [path.join(TDD_BRIDGE_DIR, 'tdd-guard-pretool-bridge.cjs')], {
        input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'test.ts' } }),
        encoding: 'utf8',
        env: { ...process.env, PATH: `${fakeDir}:${process.env.PATH ?? ''}` },
      });
      expect(r.stderr).toBe('');
    } finally {
      rmSync(fakeDir, { recursive: true, force: true });
    }
  });
});


// ── gitnexus-impact-reminder.py ──────────────────────────────────────────────

function runPythonHook(
  hookFile: string,
  input: Record<string, unknown>,
) {
  return spawnSync('python3', [path.join(HOOKS_DIR, hookFile)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env },
  });
}

describe('gitnexus-impact-reminder.py', () => {
  it('injects additionalContext when prompt contains an edit-intent keyword', () => {
    const r = runPythonHook('gitnexus-impact-reminder.py', {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'fix the broken auth logic in login.ts',
    });
    expect(r.status).toBe(0);
    const out = parseHookJson(r.stdout);
    expect(out?.hookSpecificOutput?.additionalContext).toContain('gitnexus impact');
  });

  it('does nothing (no output) when prompt has no edit-intent keywords', () => {
    const r = runPythonHook('gitnexus-impact-reminder.py', {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'explain how the beads gate works',
    });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('does nothing for non-UserPromptSubmit events', () => {
    const r = runPythonHook('gitnexus-impact-reminder.py', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.ts' },
      prompt: 'fix something',
    });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});
