#!/usr/bin/env node
// Claude Code PreToolUse hook — block writes and direct master pushes
// Exit 0: allow  |  Exit 2: block (message shown to user)
//
// Installed by: xtrm install

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
    systemMessage: reason,
  }));
  process.stdout.write('\n');
  process.exit(2);
}

const WRITE_TOOLS = new Set([
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  'mcp__serena__rename_symbol',
  'mcp__serena__replace_symbol_body',
  'mcp__serena__insert_after_symbol',
  'mcp__serena__insert_before_symbol',
]);

if (WRITE_TOOLS.has(tool)) {
  deny(`⛔ On '${branch}' — checkout a feature branch first.\n`
    + '  git checkout -b feature/<name>\n');
}

const WORKFLOW =
  '  1. git checkout -b feature/<name>\n'
  + '  2. bd create + bd update in_progress\n'
  + '  3. bd close <id> && git add && git commit\n'
  + '  4. git push -u origin feature/<name>\n'
  + '  5. gh pr create --fill && gh pr merge --squash\n';

if (tool === 'Bash') {
  const cmd = (input.tool_input?.command ?? '').trim().replace(/\s+/g, ' ');

  // Emergency override — escape hatch for power users
  if (process.env.MAIN_GUARD_ALLOW_BASH === '1') {
    process.exit(0);
  }

  // Enforce squash-only PR merges for linear history
  // Must check BEFORE the gh allowlist pattern
  if (/^gh\s+pr\s+merge\b/.test(cmd)) {
    if (!/--squash\b/.test(cmd)) {
      deny('⛔ Squash only: gh pr merge --squash\n'
        + '  (override: MAIN_GUARD_ALLOW_BASH=1 gh pr merge --merge)\n');
    }
    // --squash present — allow
    process.exit(0);
  }

  // Safe allowlist — non-mutating commands + explicit branch-exit paths.
  // Important: do not allow generic checkout/switch forms, which include
  // mutating variants such as `git checkout -- <path>`.
  const SAFE_BASH_PATTERNS = [
    /^git\s+(status|log|diff|branch|show|describe|fetch|remote|config)\b/,
    /^git\s+pull\b/,
    /^git\s+stash\b/,
    /^git\s+worktree\b/,
    /^git\s+checkout\s+-b\s+\S+/,
    /^git\s+switch\s+-c\s+\S+/,
    // Allow post-merge sync to protected branch only (not arbitrary origin refs)
    ...protectedBranches.map(b => new RegExp(`^git\\s+reset\\s+--hard\\s+origin/${b}\\b`)),
    /^gh\s+/,
    /^bd\s+/,
    /^touch\s+\.beads\//,
  ];

  if (SAFE_BASH_PATTERNS.some(p => p.test(cmd))) {
    process.exit(0);
  }

  // Specific messages for common blocked operations
  if (/^git\s+commit\b/.test(cmd)) {
    deny(`⛔ No commits on '${branch}' — use a feature branch.\n`
      + '  git checkout -b feature/<name>\n');
  }

  if (/^git\s+push\b/.test(cmd)) {
    const tokens = cmd.split(' ');
    const lastToken = tokens[tokens.length - 1];
    const explicitProtected = protectedBranches.some(b => lastToken === b || lastToken.endsWith(`:${b}`));
    const impliedProtected = tokens.length <= 3 && protectedBranches.includes(branch);
    if (explicitProtected || impliedProtected) {
      deny(`⛔ No direct push to '${branch}' — push a feature branch and open a PR.\n`
        + '  git push -u origin <feature-branch> && gh pr create --fill\n');
    }
    // Pushing to a feature branch — allow
    process.exit(0);
  }

  // Default deny — block everything else on protected branches
  deny(`⛔ Bash restricted on '${branch}'. Allowed: git status/log/diff/pull/stash, gh, bd.\n`
    + '  Exit: git checkout -b feature/<name>\n'
    + '  Override: MAIN_GUARD_ALLOW_BASH=1 <cmd>\n');
}

process.exit(0);
