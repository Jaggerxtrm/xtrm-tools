#!/usr/bin/env node
// beads-stop-gate — Claude Code Stop hook
// Blocks the agent from stopping when this session has an unclosed claim in bd kv.
// Falls back to global in_progress check when session_id is unavailable.
// Exit 0: allow stop  |  Exit 2: block stop (stderr shown to Claude)
//
// Installed by: xtrm install

import {
  readHookInput,
  resolveSessionContext,
  resolveClaimAndWorkState,
  decideStopGate,
} from './beads-gate-core.mjs';
import { withSafeBdContext } from './beads-gate-utils.mjs';
import { stopBlockMessage } from './beads-gate-messages.mjs';

const input = readHookInput();
if (!input) process.exit(0);

withSafeBdContext(() => {
  const ctx = resolveSessionContext(input);
  if (!ctx || !ctx.isBeadsProject) process.exit(0);

  const state = resolveClaimAndWorkState(ctx);
  const decision = decideStopGate(ctx, state);

  if (decision.allow) process.exit(0);

  // Block with message
  process.stderr.write(stopBlockMessage(decision.summary, decision.claimed));
  process.exit(2);
});
