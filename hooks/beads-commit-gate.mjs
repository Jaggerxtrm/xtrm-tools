#!/usr/bin/env node
// beads-commit-gate — Claude Code PreToolUse hook
// Blocks `git commit` when this session still has an unclosed claim in bd kv.
// Falls back to global in_progress check when session_id is unavailable.
// Forces: close issues first, THEN commit.
// Exit 0: allow  |  Exit 2: block (stderr shown to Claude)
//
// Installed by: xtrm install

import {
  readHookInput,
  resolveSessionContext,
  resolveClaimAndWorkState,
  decideCommitGate,
} from './beads-gate-core.mjs';
import { withSafeBdContext } from './beads-gate-utils.mjs';
import { commitBlockMessage } from './beads-gate-messages.mjs';

const input = readHookInput();
if (!input) process.exit(0);

// Only intercept git commit commands
if ((input.tool_name ?? '') !== 'Bash') process.exit(0);
if (!/\bgit\s+commit\b/.test(input.tool_input?.command ?? '')) process.exit(0);

withSafeBdContext(() => {
  const ctx = resolveSessionContext(input);
  if (!ctx || !ctx.isBeadsProject) process.exit(0);

  const state = resolveClaimAndWorkState(ctx);
  const decision = decideCommitGate(ctx, state);

  if (decision.allow) process.exit(0);

  // Block with message
  process.stderr.write(commitBlockMessage(decision.summary, decision.claimed));
  process.exit(2);
});
