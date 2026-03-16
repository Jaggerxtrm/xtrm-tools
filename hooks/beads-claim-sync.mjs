#!/usr/bin/env node
// beads-claim-sync — PostToolUse hook
// Auto-sets bd kv claim when bd update --claim is detected.

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
  if (!commandSucceeded(input)) process.exit(0);

  const cwd = input.cwd || process.cwd();
  if (!isBeadsProject(cwd)) process.exit(0);

  const command = input.tool_input?.command || '';
  if (!/\bbd\s+update\b/.test(command) || !/--claim\b/.test(command)) {
    process.exit(0);
  }

  const match = command.match(/\bbd\s+update\s+(\S+)/);
  if (!match) process.exit(0);

  const issueId = match[1];
  const sessionId = input.session_id ?? input.sessionId;

  if (!sessionId) {
    process.stderr.write('Beads claim sync: no session_id in hook input\n');
    process.exit(0);
  }

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

main();
