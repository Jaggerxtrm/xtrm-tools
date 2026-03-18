#!/usr/bin/env node
// beads-stop-gate — Claude Code Stop hook
// Blocks the agent from stopping when this session has an unclosed claim in bd kv.
// Also blocks when xtrm session state indicates unfinished closure phases.
// Exit 0: allow stop  |  Exit 2: block stop (stderr shown to Claude)

import {
  readHookInput,
  resolveSessionContext,
  resolveClaimAndWorkState,
  decideStopGate,
} from './beads-gate-core.mjs';
import { withSafeBdContext } from './beads-gate-utils.mjs';
import {
  stopBlockMessage,
  stopBlockWaitingMergeMessage,
  stopBlockConflictingMessage,
  stopWarnActiveWorktreeMessage,
} from './beads-gate-messages.mjs';
import { readSessionState } from './session-state.mjs';

const input = readHookInput();
if (!input) process.exit(0);

function evaluateSessionState(cwd) {
  const state = readSessionState(cwd);
  if (!state) return { allow: true };

  if (state.phase === 'cleanup-done' || state.phase === 'merged') {
    return { allow: true, state };
  }

  if (state.phase === 'waiting-merge' || state.phase === 'pending-cleanup') {
    return {
      allow: false,
      state,
      message: stopBlockWaitingMergeMessage(state),
    };
  }

  if (state.phase === 'conflicting') {
    return {
      allow: false,
      state,
      message: stopBlockConflictingMessage(state),
    };
  }

  if (state.phase === 'claimed' || state.phase === 'phase1-done') {
    return {
      allow: true,
      state,
      warning: stopWarnActiveWorktreeMessage(state),
    };
  }

  return { allow: true, state };
}

withSafeBdContext(() => {
  const ctx = resolveSessionContext(input);
  if (!ctx || !ctx.isBeadsProject) process.exit(0);

  const state = resolveClaimAndWorkState(ctx);
  const decision = decideStopGate(ctx, state);

  if (!decision.allow) {
    process.stderr.write(stopBlockMessage(decision.summary, decision.claimed));
    process.exit(2);
  }

  const sessionDecision = evaluateSessionState(ctx.cwd);
  if (!sessionDecision.allow) {
    process.stderr.write(sessionDecision.message);
    process.exit(2);
  }

  if (sessionDecision.warning) {
    process.stderr.write(sessionDecision.warning);
  }

  process.exit(0);
});
