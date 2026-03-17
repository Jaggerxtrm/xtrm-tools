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
import { resolveCwd, isBeadsProject, getSessionClaim } from './beads-gate-utils.mjs';
import { memoryPromptMessage } from './beads-gate-messages.mjs';

const input = readHookInput();
if (!input) process.exit(0);

const cwd = resolveCwd(input);
if (!cwd || !isBeadsProject(cwd)) process.exit(0);

// Agent signals evaluation complete by touching this marker, then stops again
const marker = join(cwd, '.beads', '.memory-gate-done');
if (existsSync(marker)) {
  try { unlinkSync(marker); } catch { /* ignore */ }
  process.exit(0);
}

// Only fire if this session had an active claim that is now closed
const sessionId = input.session_id ?? null;
if (!sessionId) process.exit(0);

const claimId = getSessionClaim(sessionId, cwd);
if (!claimId) process.exit(0); // no claim this session → no work to persist

// Check if the claimed issue was closed this session
let claimClosed = false;
try {
  const out = execSync('bd list --status=closed', {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 8000,
  });
  claimClosed = out.includes(claimId);
} catch {
  process.exit(0); // fail open
}

if (!claimClosed) process.exit(0);

process.stderr.write(memoryPromptMessage());
process.exit(2);
