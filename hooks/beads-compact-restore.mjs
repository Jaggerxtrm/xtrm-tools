#!/usr/bin/env node
// Claude Code SessionStart hook — restore in_progress beads issues after context compaction.
// Reads .beads/.last_active (written by beads-compact-save.mjs), reinstates statuses,
// deletes the marker, and injects a brief agent context message.
// Exit 0 in all paths (informational only).
//
// Installed by: xtrm install

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const lastActivePath = path.join(cwd, '.beads', '.last_active');

if (!existsSync(lastActivePath)) process.exit(0);

const ids = readFileSync(lastActivePath, 'utf8').trim().split('\n').filter(Boolean);

// Clean up regardless of whether restore succeeds
unlinkSync(lastActivePath);

if (ids.length === 0) process.exit(0);

let restored = 0;
for (const id of ids) {
  try {
    execSync(`bd update ${id} --status in_progress`, {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    restored++;
  } catch {
    // ignore — issue may no longer exist
  }
}

if (restored > 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalSystemPrompt:
          `Restored ${restored} in_progress issue${restored === 1 ? '' : 's'} from last session before compaction. Check \`bd list\` for details.`,
      },
    }) + '\n',
  );
}

process.exit(0);
