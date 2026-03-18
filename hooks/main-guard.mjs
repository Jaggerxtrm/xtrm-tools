#!/usr/bin/env node
// Claude Code PreToolUse hook — block writes and direct master pushes
// Exit 0: allow  |  Exit 2: block (message shown to user)
//
// Installed by: xtrm install

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { WRITE_TOOLS, DANGEROUS_BASH_PATTERNS } from './guard-rules.mjs';

let branch = '';
try {
  branch = execSync('git branch --show-current', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch {}

// Determine protected branches — env var override for tests and custom setups
const protectedBranches = process.env.MAIN_GUARD_PROTECTED_BRANCHES
  ? process.env.MAIN_GUARD_PROTECTED_BRANCHES.split(',').map(b => b.trim()).filter(Boolean)
  : ['main', 'master'];

// Not in a git repo or not on a protected branch — allow
if (!branch || !protectedBranches.includes(branch)) {
  process.exit(0);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const tool = input.tool_name ?? '';
const hookEventName = input.hook_event_name ?? 'PreToolUse';

function deny(reason) {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason,
  }));
  process.stdout.write('\n');
  process.exit(0);
}

if (WRITE_TOOLS.includes(tool)) {
  deny(`⛔ On '${branch}' — switch to your worktree for edits.\n`
    + '  cd .worktrees/<id>   (or bd update <id> --claim to create one)\n');
}

if (tool === 'Bash') {
  const cmd = (input.tool_input?.command ?? '').trim().replace(/\s+/g, ' ');

  // Emergency override — escape hatch for power users
  if (process.env.MAIN_GUARD_ALLOW_BASH === '1') {
    process.exit(0);
  }

  // Enforce squash-only PR merges for linear history
  if (/^gh\s+pr\s+merge\b/.test(cmd)) {
    if (!/--squash\b/.test(cmd)) {
      deny('⛔ Squash only: gh pr merge --squash\n'
        + '  (override: MAIN_GUARD_ALLOW_BASH=1 gh pr merge --merge)\n');
    }
    process.exit(0);
  }

  // Always allow: branch creation and post-merge sync
  if (/^git\s+checkout\s+-b\b/.test(cmd) || /^git\s+switch\s+-c\b/.test(cmd)) process.exit(0);
  if (protectedBranches.some(b => new RegExp(`^git\\s+reset\\s+--hard\\s+origin/${b}\\b`).test(cmd))) process.exit(0);

  // Specific messages for common operations
  if (/(?:^|\s)git\s+commit\b/.test(cmd)) {
    deny(`⛔ No commits on '${branch}' — commit from your worktree.\n`
      + '  cd .worktrees/<id>\n');
  }

  if (/(?:^|\s)git\s+push\b/.test(cmd)) {
    const tokens = cmd.split(' ');
    const lastToken = tokens[tokens.length - 1];
    const explicitProtected = protectedBranches.some(b => lastToken === b || lastToken.endsWith(`:${b}`));
    const impliedProtected = tokens.length <= 3 && protectedBranches.includes(branch);
    if (explicitProtected || impliedProtected) {
      deny(`⛔ No direct push to '${branch}' — push from your worktree.\n`
        + '  cd .worktrees/<id>\n');
    }
    process.exit(0);
  }

  // Block dangerous mutating patterns (file edits, destructive ops)
  const dangerousRe = DANGEROUS_BASH_PATTERNS.map(p => new RegExp(p));
  if (dangerousRe.some(r => r.test(cmd))) {
    deny(`⛔ Mutating operation restricted on '${branch}'. Use your worktree.\n`
      + '  cd .worktrees/<id>\n'
      + '  Override: MAIN_GUARD_ALLOW_BASH=1 <cmd>\n');
  }

  // Allow all other Bash (reads, scripts, inspections, etc.)
  process.exit(0);
}

process.exit(0);
