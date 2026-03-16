#!/usr/bin/env node
// beads-claim-sync — PostToolUse hook
// Auto-sets bd kv claim when bd update --claim is detected in Bash output.
// This ensures the claim is always synced, even if Pi extension events don't fire.
//
// Exit 0: always (non-blocking)

import { execSync } from 'node:child_process';
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

function getSessionId(input) {
  // Use project path as session key (consistent across Pi and hooks)
  return input.cwd || process.cwd();
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
  const sessionId = getSessionId(input);

  try {
    execSync(`bd kv set "claimed:${sessionId}" "${issueId}"`, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    // Inject success message into context
    process.stdout.write(JSON.stringify({
      additionalContext: `\n✅ **Beads**: Session \`${sessionId}\` claimed issue \`${issueId}\`. File edits are now unblocked.`,
    }));
    process.stdout.write('\n');
  } catch (err) {
    // Non-fatal — claim intent was there
    process.stderr.write(`Beads claim sync warning: ${err.message}\n`);
  }

  process.exit(0);
}

main();
