#!/usr/bin/env node
// beads-memory-gate — Claude Code Stop hook
// At session end, forces the agent to evaluate whether this session's work
// produced insights worth persisting via `bd remember`.
// Runs after beads-stop-gate (all issues already closed by that point).
// Exit 0: allow stop  |  Exit 2: block stop (stderr shown to Claude)
//
// Installed by: xtrm install

import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { readHookInput } from './beads-gate-core.mjs';
import { resolveCwd, resolveSessionId, isBeadsProject, getSessionClaim, clearSessionClaim } from './beads-gate-utils.mjs';
import { memoryPromptMessage } from './beads-gate-messages.mjs';
import { logEvent } from './xtrm-logger.mjs';

const input = readHookInput();
if (!input) process.exit(0);

const cwd = resolveCwd(input);
if (!cwd || !isBeadsProject(cwd)) process.exit(0);

const sessionId = resolveSessionId(input);

// Agent signals evaluation complete by touching this marker, then stops again
const marker = join(cwd, '.beads', '.memory-gate-done');
if (existsSync(marker)) {
  try { unlinkSync(marker); } catch { /* ignore */ }
  // Clear the claim and closed-this-session marker
  clearSessionClaim(sessionId, cwd);
  try {
    execSync(`bd kv clear "closed-this-session:${sessionId}"`, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
  } catch { /* ignore */ }
  logEvent({
    cwd,
    runtime: 'claude',
    sessionId,
    layer: 'gate',
    kind: 'gate.memory.acked',
    outcome: 'allow',
  });
  process.exit(0);
}

// Check if an issue was closed this session (set by beads-claim-sync on bd close)
let closedIssueId = null;
try {
  closedIssueId = execSync(`bd kv get "closed-this-session:${sessionId}"`, {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 5000,
  }).trim();
} catch (err) {
  if (err.status === 1) {
    // No closed-this-session marker → nothing to prompt about
    process.exit(0);
  }
  process.exit(0); // fail open
}

if (!closedIssueId) process.exit(0);

const memoryMessage = memoryPromptMessage();
logEvent({
  cwd,
  runtime: 'claude',
  sessionId,
  layer: 'gate',
  kind: 'gate.memory.triggered',
  outcome: 'block',
  issueId: closedIssueId,
  message: memoryMessage,
});
process.stderr.write(memoryMessage);
process.exit(2);
