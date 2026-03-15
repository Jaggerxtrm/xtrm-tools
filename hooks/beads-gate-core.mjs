#!/usr/bin/env node
// beads-gate-core.mjs — pure decision functions for beads gate hooks
// Import from sibling hooks using: import { ... } from './beads-gate-core.mjs';
//
// All functions are pure: they return decision objects, never call process.exit()
// or write to stdout/stderr. Side effects belong in entrypoint wrappers.
//
// Dependencies: beads-gate-utils.mjs (adapters)

import { readFileSync } from 'node:fs';
import {
  resolveCwd,
  isBeadsProject,
  getSessionClaim,
  getTotalWork,
  getInProgress,
} from './beads-gate-utils.mjs';

// ── Input parsing ────────────────────────────────────────────────────────────

/**
 * Read and parse hook input from stdin. Returns null on parse error.
 * Entrypoints should exit 0 if this returns null (fail-open).
 */
export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

// ── Session context resolution ───────────────────────────────────────────────

/**
 * Resolve session context from hook input.
 * Returns { cwd, sessionId, isBeadsProject } or null if cwd can't be resolved.
 */
export function resolveSessionContext(input) {
  const cwd = resolveCwd(input);
  if (!cwd) return null;
  return {
    cwd,
    sessionId: input.session_id ?? null,
    isBeadsProject: isBeadsProject(cwd),
  };
}

// ── Claim and work state resolution ──────────────────────────────────────────

/**
 * Resolve the claim and work state for a session.
 * Returns { claimed, claimId, totalWork, inProgress } or null if bd unavailable.
 */
export function resolveClaimAndWorkState(ctx) {
  if (!ctx.isBeadsProject) {
    return { claimed: false, claimId: null, totalWork: 0, inProgress: null };
  }

  const totalWork = getTotalWork(ctx.cwd);
  if (totalWork === null) return null; // bd unavailable

  const inProgress = getInProgress(ctx.cwd);

  if (ctx.sessionId) {
    const claimId = getSessionClaim(ctx.sessionId, ctx.cwd);
    if (claimId === null) return null; // bd kv unavailable
    return {
      claimed: !!claimId,
      claimId: claimId || null,
      totalWork,
      inProgress,
    };
  }

  // No session_id: fallback to global in_progress check
  return {
    claimed: false,
    claimId: null,
    totalWork,
    inProgress,
  };
}

// ── Decision functions ───────────────────────────────────────────────────────

/**
 * Decide whether to allow or block an edit operation.
 * Returns { allow: boolean, reason?: string, sessionId?: string }
 */
export function decideEditGate(ctx, state) {
  // Not a beads project → allow
  if (!ctx.isBeadsProject) {
    return { allow: true };
  }

  // bd unavailable → fail open
  if (state === null) {
    return { allow: true };
  }

  // Session has an active claim → allow
  if (state.claimed) {
    return { allow: true };
  }

  // No trackable work → allow (clean-start state)
  if (state.totalWork === 0) {
    return { allow: true };
  }

  // Has session_id but no claim + has work → block
  if (ctx.sessionId) {
    return {
      allow: false,
      reason: 'no_claim_with_work',
      sessionId: ctx.sessionId,
    };
  }

  // Fallback: no session_id, check global in_progress
  if (state.inProgress && state.inProgress.count > 0) {
    return { allow: true };
  }

  // No session_id, no in_progress, but has open work → block
  if (state.totalWork > 0) {
    return {
      allow: false,
      reason: 'no_claim_fallback',
    };
  }

  return { allow: true };
}

/**
 * Decide whether to allow or block a git commit operation.
 * Returns { allow: boolean, reason?: string, summary?: string, claimed?: string }
 */
export function decideCommitGate(ctx, state) {
  // Not a beads project → allow
  if (!ctx.isBeadsProject) {
    return { allow: true };
  }

  // bd unavailable → fail open
  if (state === null) {
    return { allow: true };
  }

  // No active claim → allow (nothing to close)
  if (!state.claimed) {
    return { allow: true };
  }

  // Has claim but check if there are still in_progress issues
  const summary = state.inProgress?.summary ?? null;

  // Session has claim → block (need to close first)
  return {
    allow: false,
    reason: 'unclosed_claim',
    summary,
    claimed: state.claimId,
  };
}

/**
 * Decide whether to allow or block a stop operation.
 * Returns { allow: boolean, reason?: string, summary?: string, claimed?: string }
 */
export function decideStopGate(ctx, state) {
  // Not a beads project → allow
  if (!ctx.isBeadsProject) {
    return { allow: true };
  }

  // bd unavailable → fail open
  if (state === null) {
    return { allow: true };
  }

  // No active claim → allow
  if (!state.claimed) {
    // But check for global in_progress (no session_id fallback)
    if (!ctx.sessionId && state.inProgress && state.inProgress.count > 0) {
      return {
        allow: false,
        reason: 'global_in_progress',
        summary: state.inProgress.summary,
      };
    }
    return { allow: true };
  }

  // Has claim but no in_progress issues → allow (stale claim)
  if (!state.inProgress || state.inProgress.count === 0) {
    return { allow: true };
  }

  // Has claim + in_progress issues → block
  return {
    allow: false,
    reason: 'unclosed_claim',
    summary: state.inProgress.summary,
    claimed: state.claimId,
  };
}
