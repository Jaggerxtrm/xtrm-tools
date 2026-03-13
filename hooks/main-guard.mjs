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

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

if (WRITE_TOOLS.has(tool)) {
  process.stderr.write(
    `⛔ You are on '${branch}' — never edit files directly on master.\n\n` +
    'Full workflow:\n' +
    '  1. git checkout -b feature/<name>         ← start here\n' +
    '  2. bd create + bd update in_progress      track your work\n' +
    '  3. Edit files / write code\n' +
    '  4. bd close <id> && git add && git commit\n' +
    '  5. git push -u origin feature/<name>\n' +
    '  6. gh pr create --fill && gh pr merge --squash\n' +
    '  7. git checkout master && git reset --hard origin/master\n'
  );
  process.exit(2);
}

const WORKFLOW =
  'Full workflow:\n' +
  '  1. git checkout -b feature/<name>         \u2190 start here\n' +
  '  2. bd create + bd update in_progress      track your work\n' +
  '  3. Edit files / write code\n' +
  '  4. bd close <id> && git add && git commit\n' +
  '  5. git push -u origin feature/<name>\n' +
  '  6. gh pr create --fill && gh pr merge --squash\n' +
  '  7. git checkout master && git reset --hard origin/master\n';

if (tool === 'Bash') {
  const cmd = (input.tool_input?.command ?? '').trim().replace(/\s+/g, ' ');

  // Emergency override — escape hatch for power users
  if (process.env.MAIN_GUARD_ALLOW_BASH === '1') {
    process.exit(0);
  }

  // Safe allowlist — non-mutating commands allowed on protected branches
  const SAFE_BASH_PATTERNS = [
    /^git\s+(status|log|diff|branch|show|describe|fetch|remote|config)\b/,
    /^git\s+pull\b/,
    /^git\s+stash\b/,
    /^git\s+worktree\b/,
    /^git\s+(checkout|switch)\b/,
    /^gh\s+/,
    /^bd\s+/,
  ];

  if (SAFE_BASH_PATTERNS.some(p => p.test(cmd))) {
    process.exit(0);
  }

  // Specific messages for common blocked operations
  if (/^git\s+commit\b/.test(cmd)) {
    process.stderr.write(
      `\u26D4 Don't commit directly to '${branch}' \u2014 use a feature branch.\n\n` +
      WORKFLOW
    );
    process.exit(2);
  }

  if (/^git\s+push\b/.test(cmd)) {
    const tokens = cmd.split(' ');
    const lastToken = tokens[tokens.length - 1];
    const explicitProtected = protectedBranches.some(b => lastToken === b || lastToken.endsWith(`:${b}`));
    const impliedProtected = tokens.length <= 3 && protectedBranches.includes(branch);
    if (explicitProtected || impliedProtected) {
      process.stderr.write(
        `\u26D4 Don't push directly to '${branch}' \u2014 use the PR workflow.\n\n` +
        'Next steps:\n' +
        '  5. git push -u origin <feature-branch>     \u2190 push your branch\n' +
        '  6. gh pr create --fill                      create PR\n' +
        '     gh pr merge --squash                     merge it\n' +
        '  7. git checkout master                      sync master\n' +
        '     git reset --hard origin/master\n\n' +
        "If you're not on a feature branch yet:\n" +
        '  git checkout -b feature/<name>    (then re-commit and push)\n'
      );
      process.exit(2);
    }
    // Pushing to a feature branch — allow
    process.exit(0);
  }

  // Default deny — block everything else on protected branches
  process.stderr.write(
    `\u26D4 Bash is restricted on '${branch}' \u2014 use a feature branch for file writes and script execution.\n\n` +
    'Allowed on protected branches:\n' +
    '  git status / log / diff / branch / fetch / pull / stash\n' +
    '  git checkout -b <name>   (create feature branch \u2014 the exit path)\n' +
    '  git switch -c <name>     (same)\n' +
    '  git worktree / config\n' +
    '  gh <any>                 (GitHub CLI)\n' +
    '  bd <any>                 (beads issue tracking)\n\n' +
    'To run arbitrary commands:\n' +
    '  1. git checkout -b feature/<name>   \u2190 move to a feature branch, or\n' +
    '  2. MAIN_GUARD_ALLOW_BASH=1 <command>  (escape hatch, use sparingly)\n'
  );
  process.exit(2);
}

process.exit(0);
