#!/usr/bin/env node
// beads-claim-sync — PostToolUse hook
// bd update --claim → set kv claim + create worktree
// bd close         → auto-commit staged changes, set closed-this-session kv for memory gate

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeSessionState } from './session-state.mjs';
import { resolveSessionId } from './beads-gate-utils.mjs';

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    return null;
  }
}

function isBeadsProject(cwd) {
  return existsSync(join(cwd, '.beads'));
}

function isShellTool(toolName) {
  return toolName === 'Bash' || toolName === 'bash' || toolName === 'execute_shell_command';
}

function commandSucceeded(payload) {
  const tr = payload?.tool_response ?? payload?.tool_result ?? payload?.result;
  if (!tr || typeof tr !== 'object') return true;

  if (tr.success === false) return false;
  if (tr.error) return false;

  const numeric = [tr.exit_code, tr.exitCode, tr.status, tr.returncode].find((v) => Number.isInteger(v));
  if (typeof numeric === 'number' && numeric !== 0) return false;

  return true;
}

function runGit(args, cwd, timeout = 8000) {
  return spawnSync('git', args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout,
  });
}

function runBd(args, cwd, timeout = 5000) {
  return spawnSync('bd', args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout,
  });
}

function hasGitChanges(cwd) {
  const result = runGit(['status', '--porcelain'], cwd);
  if (result.status !== 0) return false;
  return result.stdout.trim().length > 0;
}

function getCloseReason(cwd, issueId, command) {
  // 1. Parse --reason "..." from the command itself (fastest, no extra call)
  const reasonMatch = command.match(/--reason[=\s]+["']([^"']+)["']/);
  if (reasonMatch) return reasonMatch[1].trim();

  // 2. Fall back to bd show <id> --json
  const show = runBd(['show', issueId, '--json'], cwd);
  if (show.status === 0 && show.stdout) {
    try {
      const parsed = JSON.parse(show.stdout);
      const reason = parsed?.[0]?.close_reason;
      if (typeof reason === 'string' && reason.trim().length > 0) return reason.trim();
    } catch { /* fall through */ }
  }

  return `Close ${issueId}`;
}

function autoCommit(cwd, issueId, command) {
  if (!hasGitChanges(cwd)) {
    return { ok: true, message: 'No changes detected — auto-commit skipped.' };
  }

  const reason = getCloseReason(cwd, issueId, command);
  const commitMessage = `${reason} (${issueId})`;
  const result = runGit(['commit', '-am', commitMessage], cwd, 15000);
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    return { ok: false, message: `Auto-commit failed: ${err || 'unknown error'}` };
  }

  return { ok: true, message: `Auto-committed: \`${commitMessage}\`` };
}

function getRepoRoot(cwd) {
  const result = runGit(['rev-parse', '--show-toplevel'], cwd);
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function inLinkedWorktree(cwd) {
  const gitDir = runGit(['rev-parse', '--git-dir'], cwd);
  const gitCommonDir = runGit(['rev-parse', '--git-common-dir'], cwd);
  if (gitDir.status !== 0 || gitCommonDir.status !== 0) return false;
  return gitDir.stdout.trim() !== gitCommonDir.stdout.trim();
}

function ensureWorktreeForClaim(cwd, issueId) {
  const repoRoot = getRepoRoot(cwd);
  if (!repoRoot) return { created: false, reason: 'not-git' };

  if (inLinkedWorktree(cwd)) {
    return { created: false, reason: 'already-worktree', repoRoot };
  }

  const overstoryDir = join(repoRoot, '.overstory');
  const worktreesBase = existsSync(overstoryDir)
    ? join(overstoryDir, 'worktrees')
    : join(repoRoot, '.worktrees');

  mkdirSync(worktreesBase, { recursive: true });

  const branch = `feature/${issueId}`;
  const worktreePath = join(worktreesBase, issueId);

  const worktreeExists = existsSync(worktreePath);
  const branchExists = runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot).status === 0;

  if (worktreeExists) {
    // Validate it's actually a worktree (not a plain dir from a race)
    if (existsSync(join(worktreePath, '.git'))) {
      try {
        const stateFile = writeSessionState({
          issueId, branch, worktreePath, prNumber: null, prUrl: null,
          phase: 'claimed', conflictFiles: [],
        }, { cwd: repoRoot });
        return { created: false, reason: 'exists', repoRoot, branch, worktreePath, stateFile };
      } catch {
        return { created: false, reason: 'exists', repoRoot, branch, worktreePath };
      }
    }
    return {
      created: false, reason: 'create-failed', repoRoot, branch, worktreePath,
      error: `Directory ${worktreePath} exists but is not a valid worktree`,
    };
  }

  const addArgs = branchExists
    ? ['worktree', 'add', worktreePath, branch]
    : ['worktree', 'add', worktreePath, '-b', branch];

  const addResult = runGit(addArgs, repoRoot, 20000);
  if (addResult.status !== 0) {
    // TOCTOU race: another process may have created the worktree between our check and add
    const stderr = (addResult.stderr || addResult.stdout || '').trim();
    if (stderr.includes('already exists') || existsSync(join(worktreePath, '.git'))) {
      try {
        const stateFile = writeSessionState({
          issueId, branch, worktreePath, prNumber: null, prUrl: null,
          phase: 'claimed', conflictFiles: [],
        }, { cwd: repoRoot });
        return { created: false, reason: 'race-won', repoRoot, branch, worktreePath, stateFile };
      } catch {
        return { created: false, reason: 'race-won', repoRoot, branch, worktreePath };
      }
    }
    return {
      created: false, reason: 'create-failed', repoRoot, branch, worktreePath,
      error: stderr,
    };
  }

  try {
    const stateFile = writeSessionState({
      issueId,
      branch,
      worktreePath,
      prNumber: null,
      prUrl: null,
      phase: 'claimed',
      conflictFiles: [],
    }, { cwd: repoRoot });

    return {
      created: true,
      reason: 'created',
      repoRoot,
      branch,
      worktreePath,
      stateFile,
    };
  } catch (err) {
    return {
      created: true,
      reason: 'created-state-write-failed',
      repoRoot,
      branch,
      worktreePath,
      error: String(err?.message || err),
    };
  }
}

function main() {
  const input = readInput();
  if (!input || input.hook_event_name !== 'PostToolUse') process.exit(0);
  if (!isShellTool(input.tool_name)) process.exit(0);

  const cwd = input.cwd || process.cwd();
  if (!isBeadsProject(cwd)) process.exit(0);

  const command = input.tool_input?.command || '';
  const sessionId = resolveSessionId(input);

  // Auto-claim: bd update <id> --claim (fire regardless of exit code — bd returns 1 for "already in_progress")
  if (/\bbd\s+update\b/.test(command) && /--claim\b/.test(command)) {
    const match = command.match(/\bbd\s+update\s+(\S+)/);
    if (match) {
      const issueId = match[1];
      const result = spawnSync('bd', ['kv', 'set', `claimed:${sessionId}`, issueId], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });

      if (result.status !== 0) {
        const err = (result.stderr || result.stdout || '').toString().trim();
        if (err) process.stderr.write(`Beads claim sync warning: ${err}\n`);
        process.exit(0);
      }

      const wt = ensureWorktreeForClaim(cwd, issueId);
      const details = [];
      if (wt.created) {
        details.push(`🧭 **Session Flow**: Worktree created: \`${wt.worktreePath}\`  Branch: \`${wt.branch}\``);
      } else if (wt.reason === 'exists') {
        details.push(`🧭 **Session Flow**: Worktree already exists: \`${wt.worktreePath}\`  Branch: \`${wt.branch}\``);
      } else if (wt.reason === 'already-worktree') {
        details.push('🧭 **Session Flow**: Already in a linked worktree — skipping nested worktree creation.');
      } else if (wt.reason === 'race-won') {
        details.push(`🧭 **Session Flow**: Worktree ready (race): \`${wt.worktreePath}\`  Branch: \`${wt.branch}\``);
      } else if (wt.reason === 'create-failed') {
        const err = wt.error ? `\nWarning: ${wt.error}` : '';
        details.push(`⚠️ **Session Flow**: Worktree creation failed for \`${issueId}\`. Continuing without blocking claim.${err}`);
      }

      process.stdout.write(JSON.stringify({
        additionalContext: `\n✅ **Beads**: Session \`${sessionId}\` claimed issue \`${issueId}\`.${details.length ? `\n${details.join('\n')}` : ''}`,
      }));
      process.stdout.write('\n');
      process.exit(0);
    }
  }

  // On bd close: auto-commit staged changes, then mark closed-this-session for memory gate
  if (/\bbd\s+close\b/.test(command) && commandSucceeded(input)) {
    const match = command.match(/\bbd\s+close\s+(\S+)/);
    const closedIssueId = match?.[1];

    // Auto-commit before marking the gate (no-op if clean)
    const commit = closedIssueId ? autoCommit(cwd, closedIssueId, command) : null;

    // Mark this issue as closed this session (memory gate reads this)
    if (closedIssueId) {
      spawnSync('bd', ['kv', 'set', `closed-this-session:${sessionId}`, closedIssueId], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });
    }

    const commitLine = commit
      ? `\n${commit.ok ? '✅' : '⚠️'} **Session Flow**: ${commit.message}`
      : '';

    process.stdout.write(JSON.stringify({
      additionalContext: `\n🔓 **Beads**: Issue closed.${commitLine}\nEvaluate insights, then acknowledge:\n  \`bd remember "<insight>"\` (or note "nothing")\n  \`touch .beads/.memory-gate-done\``,
    }));
    process.stdout.write('\n');
    process.exit(0);
  }

  process.exit(0);
}

main();
