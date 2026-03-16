#!/usr/bin/env node
// branch-state.mjs — UserPromptSubmit hook
// Re-injects current git branch and active beads claim at each prompt.
// Keeps the agent oriented after /compact or long sessions.
// Output: { hookSpecificOutput: { additionalSystemPrompt } }

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf-8')); } catch { return null; }
}

function getBranch(cwd) {
  try {
    return execSync('git branch --show-current', {
      encoding: 'utf8', cwd,
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000,
    }).trim() || null;
  } catch { return null; }
}

function getSessionClaim(sessionId, cwd) {
  try {
    const out = execSync(`bd kv get "claimed:${sessionId}"`, {
      encoding: 'utf8', cwd,
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000,
    }).trim();
    return out || null;
  } catch { return null; }
}

const input = readInput();
if (!input) process.exit(0);

const cwd = input.cwd || process.cwd();
const sessionId = input.session_id ?? input.sessionId;
const branch = getBranch(cwd);
const isBeads = existsSync(join(cwd, '.beads'));
const claim = isBeads && sessionId ? getSessionClaim(sessionId, cwd) : null;

if (!branch && !claim) process.exit(0);

const context = `[Context: branch=${branch ?? 'unknown'}${claim ? ', claim=' + claim : ''}]`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { additionalSystemPrompt: context },
}));
process.stdout.write('\n');
process.exit(0);
