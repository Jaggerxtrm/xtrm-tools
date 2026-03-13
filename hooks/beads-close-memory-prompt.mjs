#!/usr/bin/env node
// beads-close-memory-prompt — Claude Code PostToolUse hook
// After `bd close`: clears session claim from bd kv, then injects a short
// reminder into Claude's context to capture knowledge and consider underused
// beads features.
// Output to stdout is shown to Claude as additional context.
//
// Installed by: xtrm install

import { readFileSync } from 'node:fs';
import {
  resolveCwd, isBeadsProject, clearSessionClaim, withSafeBdContext,
} from './beads-gate-utils.mjs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if (input.tool_name !== 'Bash') process.exit(0);
if (!/\bbd\s+close\b/.test(input.tool_input?.command ?? '')) process.exit(0);

withSafeBdContext(() => {
  const cwd = resolveCwd(input);
  if (!isBeadsProject(cwd)) process.exit(0);

  if (input.session_id) {
    clearSessionClaim(input.session_id, cwd);
  }

  process.stdout.write(
    '\n[beads] Issue(s) closed. Before moving on:\n\n' +
    '  Knowledge worth keeping?\n' +
    '    bd remember "key insight from this work"\n' +
    '    bd memories <keyword>   -- search what is already stored\n\n' +
    '  Discovered related work while implementing?\n' +
    '    bd create --title="..." --deps=discovered-from:<id>\n\n' +
    '  Underused features to consider:\n' +
    '    bd dep add <a> <b>   -- link blocking relationships between issues\n' +
    '    bd graph             -- visualize issue dependency graph\n' +
    '    bd orphans           -- issues referenced in commits but still open\n' +
    '    bd preflight         -- PR readiness checklist before gh pr create\n' +
    '    bd stale             -- issues not touched recently\n'
  );

  process.exit(0);
});
