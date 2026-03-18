#!/usr/bin/env node
// beads-claim-sync — PostToolUse hook
// Auto-sets kv claim on bd update --claim; auto-clears on bd close.
// Also bootstraps worktree-first session state for xtrm finish workflow.

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeSessionState } from './session-state.mjs';

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

  if (existsSync(worktreePath)) {
    // Already created previously — rewrite state file for continuity.
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
      return { created: false, reason: 'exists', repoRoot, branch, worktreePath, stateFile };
    } catch {
      return { created: false, reason: 'exists', repoRoot, branch, worktreePath };
    }
  }

  const branchExists = runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot).status === 0;
  const addArgs = branchExists
    ? ['worktree', 'add', worktreePath, branch]
    : ['worktree', 'add', worktreePath, '-b', branch];

  const addResult = runGit(addArgs, repoRoot, 20000);
  if (addResult.status !== 0) {
    return {
      created: false,
      reason: 'create-failed',
      repoRoot,
      branch,
      worktreePath,
      error: (addResult.stderr || addResult.stdout || '').trim(),
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
  const sessionId = input.session_id ?? input.sessionId;

  if (!sessionId) {
    process.stderr.write('Beads claim sync: no session_id in hook input\n');
    process.exit(0);
  }

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

  // Auto-clear: bd close <id> — remove the kv claim so commit gate unblocks
  if (/\bbd\s+close\b/.test(command) && commandSucceeded(input)) {
    const result = spawnSync('bd', ['kv', 'clear', `claimed:${sessionId}`], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });

    if (result.status === 0) {
      process.stdout.write(JSON.stringify({
        additionalContext: `\n🔓 **Beads**: Session claim cleared. Ready to commit.`,
      }));
      process.stdout.write('\n');
    }
    process.exit(0);
  }

  process.exit(0);
}

main();
