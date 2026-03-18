#!/usr/bin/env node
// Claude Code SessionStart hook — restore in_progress beads issues after context compaction.
// Reads .beads/.last_active (written by beads-compact-save.mjs), reinstates statuses,
// restores session state file, deletes the marker, and injects a brief agent context message.
// Exit 0 in all paths (informational only).

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { writeSessionState } from './session-state.mjs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const lastActivePath = path.join(cwd, '.beads', '.last_active');

if (!existsSync(lastActivePath)) process.exit(0);

let ids = [];
let sessionState = null;

try {
  const raw = readFileSync(lastActivePath, 'utf8').trim();
  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw);
    ids = Array.isArray(parsed.ids) ? parsed.ids.filter(Boolean) : [];
    sessionState = parsed.sessionState ?? null;
  } else {
    // Backward compatibility: legacy newline format
    ids = raw.split('\n').filter(Boolean);
  }
} catch {
  // If file is malformed, just delete and continue fail-open.
}

// Clean up regardless of whether restore succeeds
unlinkSync(lastActivePath);

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

let restoredSession = false;
if (sessionState && typeof sessionState === 'object') {
  try {
    writeSessionState(sessionState, { cwd });
    restoredSession = true;
  } catch {
    // fail open
  }
}

if (restored > 0 || restoredSession) {
  const lines = [];
  if (restored > 0) {
    lines.push(`Restored ${restored} in_progress issue${restored === 1 ? '' : 's'} from last session before compaction.`);
  }

  if (restoredSession && (sessionState.phase === 'waiting-merge' || sessionState.phase === 'pending-cleanup')) {
    const pr = sessionState.prNumber != null ? `#${sessionState.prNumber}` : '(pending PR)';
    const prUrl = sessionState.prUrl ? ` ${sessionState.prUrl}` : '';
    lines.push(`RESUME: Run xtrm finish — PR ${pr}${prUrl} waiting for merge. Worktree: ${sessionState.worktreePath}`);
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalSystemPrompt: `${lines.join(' ')} Check \`bd list\` for details.`,
      },
    }) + '\n',
  );
}

process.exit(0);
