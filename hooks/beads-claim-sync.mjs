#!/usr/bin/env node
// beads-claim-sync — PostToolUse hook
// Auto-sets bd kv claim when bd update --claim is detected.
// Uses session_id from hook input (UUID, matches Pi's sessionManager.getSessionId())

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

function main() {
  const input = readInput();
  if (!input || input.hook_event_name !== 'PostToolUse') process.exit(0);
  if (input.tool_name !== 'Bash') process.exit(0);

  const cwd = input.cwd || process.cwd();
  if (!isBeadsProject(cwd)) process.exit(0);

  const command = input.tool_input?.command || '';
  if (!/\bbd\s+update\b/.test(command) || !/--claim\b/.test(command)) {
    process.exit(0);
  }

  // Extract issue ID from command
  const match = command.match(/\bbd\s+update\s+(\S+)/);
  if (!match) process.exit(0);

  const issueId = match[1];
  // Use session_id from hook input (UUID from Pi/Claude Code)
  const sessionId = input.session_id;

  if (!sessionId) {
    process.stderr.write('Beads claim sync: no session_id in hook input\n');
    process.exit(0);
  }

  try {
    spawnSync('bd', ['kv', 'set', `claimed:${sessionId}`, issueId], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    process.stdout.write(JSON.stringify({
      additionalContext: `\n✅ **Beads**: Session \`${sessionId}\` claimed issue \`${issueId}\`.`,
    }));
    process.stdout.write('\n');
  } catch (err) {
    process.stderr.write(`Beads claim sync warning: ${err.message}\n`);
  }

  process.exit(0);
}

main();
