#!/usr/bin/env node
// Claude Code PreToolUse hook — block writes and direct master pushes
// Exit 0: allow  |  Exit 2: block (message shown to user)
//
// Installed by: xtrm install

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WRITE_TOOLS, SAFE_BASH_PREFIXES } from './guard-rules.mjs';

let branch = '';
try {
  branch = execSync('git branch --show-current', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch {}

const protectedBranches = process.env.MAIN_GUARD_PROTECTED_BRANCHES
  ? process.env.MAIN_GUARD_PROTECTED_BRANCHES.split(',').map(b => b.trim()).filter(Boolean)
  : ['main', 'master'];

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
const cwd = input.cwd || process.cwd();

function deny(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.stdout.write('\n');
  process.exit(0);
}

function getSessionState(cwd) {
  const statePath = join(cwd, '.xtrm-session-state.json');
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeGitCCommand(cmd) {
  const match = cmd.match(/^git\s+-C\s+(?:"[^"]+"|'[^']+'|\S+)\s+(.+)$/);
  if (match?.[1]) return `git ${match[1]}`;
  return cmd;
}

if (WRITE_TOOLS.includes(tool)) {
  const state = getSessionState(cwd);
  if (state?.worktreePath) {
    deny(`⛔ On '${branch}' — active worktree session detected.\n`
      + `  cd ${state.worktreePath}\n`
      + '  Then run Claude/Pi from that worktree (sandboxed edits).\n');
  }

  deny(`⛔ On '${branch}' — start on a feature branch and claim an issue.\n`
    + '  git checkout -b feature/<name>\n'
    + '  bd update <id> --claim\n');
}

if (tool === 'Bash') {
  const cmd = (input.tool_input?.command ?? '').trim().replace(/\s+/g, ' ');
  const normalizedCmd = normalizeGitCCommand(cmd);
  const state = getSessionState(cwd);

  if (process.env.MAIN_GUARD_ALLOW_BASH === '1') {
    process.exit(0);
  }

  if (/^gh\s+pr\s+merge\b/.test(cmd)) {
    if (!/--squash\b/.test(cmd)) {
      deny('⛔ Squash only: gh pr merge --squash\n'
        + '  (override: MAIN_GUARD_ALLOW_BASH=1 gh pr merge --merge)\n');
    }
    process.exit(0);
  }

  const SAFE_BASH_PATTERNS = [
    ...SAFE_BASH_PREFIXES.map(prefix => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)),
    ...protectedBranches.map(b => new RegExp(`^git\\s+reset\\s+--hard\\s+origin/${b}\\b`)),
  ];

  if (SAFE_BASH_PATTERNS.some(p => p.test(cmd) || p.test(normalizedCmd))) {
    process.exit(0);
  }

  if (/\bgit\s+commit\b/.test(normalizedCmd)) {
    deny(`⛔ No commits on '${branch}' — use a feature branch/worktree.\n`
      + '  git checkout -b feature/<name>\n'
      + '  bd update <id> --claim\n');
  }

  if (/\bgit\s+push\b/.test(normalizedCmd)) {
    const tokens = normalizedCmd.split(' ');
    const lastToken = tokens[tokens.length - 1];
    const explicitProtected = protectedBranches.some(b => lastToken === b || lastToken.endsWith(`:${b}`));
    const impliedProtected = tokens.length <= 3 && protectedBranches.includes(branch);
    if (explicitProtected || impliedProtected) {
      deny(`⛔ No direct push to '${branch}' — push a feature branch and open a PR.\n`
        + '  git push -u origin <feature-branch> && gh pr create --fill\n');
    }
    process.exit(0);
  }

  const handoff = state?.worktreePath
    ? `  Active worktree: ${state.worktreePath}\n  Use that worktree for edits, or run: xtrm finish\n`
    : '  Exit: git checkout -b feature/<name>\n  Then: bd update <id> --claim\n';

  deny(`⛔ Bash restricted on '${branch}'. Allowed: read-only commands, gh, bd, xtrm finish.\n`
    + handoff
    + '  Override: MAIN_GUARD_ALLOW_BASH=1 <cmd>\n');
}

process.exit(0);
