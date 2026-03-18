#!/usr/bin/env node
// Claude Code PreCompact hook — save in_progress beads issues before context is compacted.
// Writes a compact bundle to .beads/.last_active for restore hook.
// Bundle includes issue IDs and xtrm session state when available.
// Exit 0 in all paths (informational only).

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readSessionState } from './session-state.mjs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const beadsDir = path.join(cwd, '.beads');

if (!existsSync(beadsDir)) process.exit(0);

let output = '';
try {
  output = execSync('bd list --status=in_progress', {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 8000,
  }).trim();
} catch {
  process.exit(0);
}

// Parse issue IDs — lines like "◐ proj-abc123 ● P1 Title"
const ids = [];
for (const line of output.split('\n')) {
  const match = line.trim().match(/^[○◐●✓❄]\s+([\w-]+)\s/u);
  if (match) ids.push(match[1]);
}

const sessionState = readSessionState(cwd);
const bundle = {
  ids,
  sessionState: sessionState ? {
    issueId: sessionState.issueId,
    branch: sessionState.branch,
    worktreePath: sessionState.worktreePath,
    prNumber: sessionState.prNumber,
    prUrl: sessionState.prUrl,
    phase: sessionState.phase,
    conflictFiles: Array.isArray(sessionState.conflictFiles) ? sessionState.conflictFiles : [],
    startedAt: sessionState.startedAt,
    lastChecked: sessionState.lastChecked,
  } : null,
  savedAt: new Date().toISOString(),
};

if (bundle.ids.length === 0 && !bundle.sessionState) process.exit(0);

writeFileSync(path.join(beadsDir, '.last_active'), JSON.stringify(bundle, null, 2) + '\n', 'utf8');

if (bundle.sessionState?.phase === 'waiting-merge') {
  const pr = bundle.sessionState.prNumber != null ? `#${bundle.sessionState.prNumber}` : '(pending PR)';
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreCompact',
        additionalSystemPrompt:
          `PENDING: xtrm finish waiting for PR ${pr} to merge. Re-run xtrm finish to resume.`,
      },
    }) + '\n',
  );
}

process.exit(0);
