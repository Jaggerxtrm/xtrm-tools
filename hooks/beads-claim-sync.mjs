#!/usr/bin/env node
// beads-claim-sync — PostToolUse hook
// Auto-sets kv claim on bd update --claim; auto-clears on bd close.

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

      process.stdout.write(JSON.stringify({
        additionalContext: `\n✅ **Beads**: Session \`${sessionId}\` claimed issue \`${issueId}\`.`,
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
