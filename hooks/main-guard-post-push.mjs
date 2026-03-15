#!/usr/bin/env node
// Claude Code PostToolUse hook — after successful feature-branch push,
// inject next-step PR workflow guidance.
// Exit 0 in all paths (informational only).
//
// Installed by: xtrm install

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if ((input.tool_name ?? '') !== 'Bash') process.exit(0);
const cmd = (input.tool_input?.command ?? '').trim().replace(/\s+/g, ' ');
if (!/^git\s+push\b/.test(cmd)) process.exit(0);

function commandSucceeded(payload) {
  const tr = payload?.tool_response ?? payload?.tool_result ?? payload?.result;
  if (!tr || typeof tr !== 'object') return true;

  if (tr.success === false) return false;
  if (tr.error) return false;

  const numeric = [tr.exit_code, tr.exitCode, tr.status, tr.returncode]
    .find((v) => Number.isInteger(v));
  if (typeof numeric === 'number' && numeric !== 0) return false;

  return true;
}

if (!commandSucceeded(input)) process.exit(0);

const cwd = input.cwd || process.cwd();
let branch = '';
try {
  branch = execSync('git branch --show-current', {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch {
  process.exit(0);
}

const protectedBranches = process.env.MAIN_GUARD_PROTECTED_BRANCHES
  ? process.env.MAIN_GUARD_PROTECTED_BRANCHES.split(',').map((b) => b.trim()).filter(Boolean)
  : ['main', 'master'];

if (!branch || protectedBranches.includes(branch)) process.exit(0);

const tokens = cmd.split(' ');
const lastToken = tokens[tokens.length - 1] ?? '';
const explicitlyProtectedTarget = protectedBranches
  .some((b) => lastToken === b || lastToken.endsWith(`:${b}`));
if (explicitlyProtectedTarget) process.exit(0);

process.stdout.write(
  `✅ Pushed '${branch}'. Next workflow steps:\n\n` +
  '  1. gh pr create --fill\n' +
  '  2. gh pr merge --squash\n' +
  '  3. git checkout main && git reset --hard origin/main\n\n' +
  'Before/after merge, ensure beads state is updated (e.g. bd close <id>).\n',
);
process.exit(0);
