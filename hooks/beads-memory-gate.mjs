#!/usr/bin/env node
// beads-memory-gate — Claude Code Stop hook
// At session end, forces the agent to evaluate whether this session's work
// produced insights worth persisting via `bd remember`.
// Runs after beads-stop-gate (all issues already closed by that point).
// Exit 0: allow stop  |  Exit 2: block stop (stderr shown to Claude)
//
// Installed by: xtrm install

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!existsSync(join(cwd, '.beads'))) process.exit(0);

// Agent signals evaluation complete by touching this marker, then stops again
const marker = join(cwd, '.beads', '.memory-gate-done');
if (existsSync(marker)) {
  try { unlinkSync(marker); } catch { /* ignore */ }
  process.exit(0);
}

// Only block if there are closed issues — don't fire on empty projects
let hasClosed = false;
try {
  const out = execSync('bd list --status=closed', {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 8000,
  });
  hasClosed = /^✓/m.test(out);
} catch {
  process.exit(0); // fail open
}

if (!hasClosed) process.exit(0);

process.stderr.write(
  '🧠 MEMORY GATE: Before ending the session, evaluate this session\'s work.\n\n' +
  'For each issue you worked on and closed, ask:\n' +
  '  Is this a stable pattern, key decision, or solution I\'ll encounter again?\n\n' +
  '  YES → bd remember "<precise, durable insight>"\n' +
  '  NO  → explicitly note "nothing worth persisting" and continue\n\n' +
  'When done, signal completion and stop again:\n' +
  '  touch .beads/.memory-gate-done\n'
);
process.exit(2);
