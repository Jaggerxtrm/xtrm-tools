#!/usr/bin/env node
// beads-edit-gate — Claude Code PreToolUse hook
// Blocks file edits when this session has not claimed a beads issue via bd kv.
// Falls back to global in_progress check when session_id is unavailable.
// Only active in projects with a .beads/ directory.
// Exit 0: allow  |  Exit 2: block (stderr shown to Claude)
//
// Installed by: xtrm install

import {
  readHookInput,
  resolveSessionContext,
  resolveClaimAndWorkState,
  decideEditGate,
} from './beads-gate-core.mjs';
import { withSafeBdContext } from './beads-gate-utils.mjs';
import { editBlockMessage, editBlockFallbackMessage } from './beads-gate-messages.mjs';

const input = readHookInput();
if (!input) process.exit(0);

withSafeBdContext(() => {
  const ctx = resolveSessionContext(input);
  if (!ctx || !ctx.isBeadsProject) process.exit(0);

  const state = resolveClaimAndWorkState(ctx);
  const decision = decideEditGate(ctx, state);

  if (decision.allow) process.exit(0);

  // Block with appropriate message
  if (decision.reason === 'no_claim_with_work') {
    process.stderr.write(editBlockMessage(decision.sessionId));
  } else {
    process.stderr.write(editBlockFallbackMessage());
  }
  process.exit(2);
});
