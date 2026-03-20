#!/usr/bin/env node
// branch-state.mjs — UserPromptSubmit hook
// Re-injects current git branch and active beads claim at each prompt.
// Keeps the agent oriented after /compact or long sessions.
// Output: { hookSpecificOutput: { additionalSystemPrompt } }

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf-8')); } catch { return null; }
}

function getBranch(cwd) {
  try {
    return execSync('git branch --show-current', {
      encoding: 'utf8', cwd,
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 2000,
    }).trim() || null;
  } catch { return null; }
}

try {
  const input = readInput();
  if (!input) process.exit(0);

  const cwd = input.cwd || process.cwd();
  const branch = getBranch(cwd);

  if (!branch) process.exit(0);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { additionalSystemPrompt: `[Context: branch=${branch}]` },
  }));
  process.stdout.write('\n');
  process.exit(0);
} catch {
  process.exit(0);
}
