#!/usr/bin/env node
// Claude Code PreCompact hook — save in_progress beads issues before context is compacted.
// Writes issue IDs to .beads/.last_active so beads-compact-restore.mjs can reinstate them.
// Exit 0 in all paths (informational only).
//
// Installed by: xtrm install

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

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

if (ids.length === 0) process.exit(0);

writeFileSync(path.join(beadsDir, '.last_active'), ids.join('\n') + '\n', 'utf8');
process.exit(0);
