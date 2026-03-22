#!/usr/bin/env node
// beads-claim-sync — PostToolUse hook
// bd update --claim → set kv claim
// bd close         → auto-commit staged changes, set closed-this-session kv for memory gate

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { resolveSessionId } from './beads-gate-utils.mjs';
import { logEvent } from './xtrm-logger.mjs';

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

// In a git worktree, --git-common-dir returns an absolute path to the main .git dir.
// In a regular repo it returns '.git' (relative). Use this to find the canonical main root
// so claim files are always written/deleted from the same location across sessions.
function resolveMainRoot(cwd) {
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], {
    cwd, encoding: 'utf8', stdio: 'pipe',
  });
  const commonDir = r.stdout?.trim();
  if (commonDir && isAbsolute(commonDir)) return dirname(commonDir);
  return cwd;
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

function stageUntracked(cwd) {
  const result = runGit(['ls-files', '--others', '--exclude-standard'], cwd);
  if (result.status !== 0) return;
  const untracked = result.stdout.trim().split('\n').filter(Boolean);
  if (untracked.length === 0) return;
  runGit(['add', '--', ...untracked], cwd);
}

function autoCommit(cwd, issueId, command) {
  if (!hasGitChanges(cwd)) {
    return { ok: true, message: 'No changes detected — auto-commit skipped.' };
  }

  stageUntracked(cwd);

  const reason = getCloseReason(cwd, issueId, command);
  const commitMessage = `${reason} (${issueId})`;
  const result = runGit(['commit', '-am', commitMessage], cwd, 15000);
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    return { ok: false, message: `Auto-commit failed: ${err || 'unknown error'}` };
  }

  return { ok: true, message: `Auto-committed: \`${commitMessage}\`` };
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

      // Write claim state for statusline — always at main repo root so all sessions share it.
      try {
        const xtrmDir = join(resolveMainRoot(cwd), '.xtrm');
        mkdirSync(xtrmDir, { recursive: true });
        writeFileSync(join(xtrmDir, 'statusline-claim'), issueId);
      } catch { /* non-fatal */ }

      logEvent({
        cwd,
        runtime: 'claude',
        sessionId,
        layer: 'bd',
        kind: 'bd.claimed',
        outcome: 'allow',
        issueId,
      });

      process.stdout.write(JSON.stringify({
        additionalContext: `\n✅ **Beads**: Session \`${sessionId}\` claimed issue \`${issueId}\`.`,
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

    // Clear claim state for statusline — use main root so worktree and main sessions agree.
    try { unlinkSync(join(resolveMainRoot(cwd), '.xtrm', 'statusline-claim')); } catch { /* ok if missing */ }

    // Mark this issue as closed this session (memory gate reads this)
    if (closedIssueId) {
      spawnSync('bd', ['kv', 'set', `closed-this-session:${sessionId}`, closedIssueId], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });
    }

    // Log bd lifecycle events
    if (closedIssueId) {
      logEvent({
        cwd,
        runtime: 'claude',
        sessionId,
        layer: 'bd',
        kind: 'bd.closed',
        outcome: 'allow',
        issueId: closedIssueId,
      });
    }
    if (commit) {
      logEvent({
        cwd,
        runtime: 'claude',
        sessionId,
        layer: 'bd',
        kind: 'bd.committed',
        outcome: commit.ok ? 'allow' : 'block',
        issueId: closedIssueId ?? null,
        data: { msg: commit.message },
        extra: { ok: commit.ok },
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
