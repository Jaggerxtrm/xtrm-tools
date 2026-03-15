#!/usr/bin/env node
// beads-gate-messages.mjs — centralized message templates for beads gate hooks
// Import from sibling hooks using: import { ... } from './beads-gate-messages.mjs';
//
// All user-facing strings live here. Edit this file to change messaging.
// Policy logic lives in beads-gate-core.mjs.

// ── Shared workflow steps ────────────────────────────────────────────────────

export const WORKFLOW_STEPS =
  '  1. git checkout -b feature/<name>         ← start here\n' +
  '  2. bd create + bd update in_progress      track your work\n' +
  '  3. Edit files / write code\n' +
  '  4. bd close <id> && git add && git commit\n' +
  '  5. git push -u origin feature/<name>\n' +
  '  6. gh pr create --fill && gh pr merge --squash\n' +
  '  7. git checkout master && git reset --hard origin/master\n';

export const SESSION_CLOSE_PROTOCOL =
  '  3. bd close <id1> <id2> ...               close all in_progress issues\n' +
  '  4. git add <files> && git commit -m "..."  commit your changes\n' +
  '  5. git push -u origin <feature-branch>     push feature branch\n' +
  '  6. gh pr create --fill                     create PR\n' +
  '  7. gh pr merge --squash                    merge PR\n' +
  '  8. git checkout master && git reset --hard origin/master\n';

export const COMMIT_NEXT_STEPS =
  '  3. bd close <id1> <id2> ...             ← you are here\n' +
  '  4. git add <files> && git commit -m "..."\n' +
  '  5. git push -u origin <feature-branch>\n' +
  '  6. gh pr create --fill && gh pr merge --squash\n' +
  '  7. git checkout master && git reset --hard origin/master\n';

// ── Edit gate messages ───────────────────────────────────────────────────────

export function editBlockMessage(sessionId) {
  return (
    '🚫 BEADS GATE: This session has no active claim — claim an issue before editing files.\n\n' +
    '  bd update <id> --status=in_progress\n' +
    `  bd kv set "claimed:${sessionId}" "<id>"\n\n` +
    'Or create a new issue:\n' +
    '  bd create --title="<what you\'re doing>" --type=task --priority=2\n' +
    '  bd update <id> --status=in_progress\n' +
    `  bd kv set "claimed:${sessionId}" "<id>"\n`
  );
}

export function editBlockFallbackMessage() {
  return (
    '🚫 BEADS GATE: No active issue — create one before editing files.\n\n' +
    '  bd create --title="<what you\'re doing>" --type=task --priority=2\n' +
    '  bd update <id> --status=in_progress\n\n' +
    'Full workflow (do this every session):\n' +
    WORKFLOW_STEPS
  );
}

// ── Commit gate messages ─────────────────────────────────────────────────────

export function commitBlockMessage(summary, claimed) {
  const issueSummary = summary ?? `  Claimed: ${claimed}`;
  return (
    '🚫 BEADS GATE: Close open issues before committing.\n\n' +
    `Open issues:\n${issueSummary}\n\n` +
    'Next steps:\n' + COMMIT_NEXT_STEPS
  );
}

// ── Stop gate messages ───────────────────────────────────────────────────────

export function stopBlockMessage(summary, claimed) {
  const issueSummary = summary ?? `  Claimed: ${claimed}`;
  return (
    '🚫 BEADS STOP GATE: Unresolved issues — complete the session close protocol.\n\n' +
    `Open issues:\n${issueSummary}\n\n` +
    'Session close protocol:\n' + SESSION_CLOSE_PROTOCOL
  );
}

// ── Memory gate messages ─────────────────────────────────────────────────────

export function memoryPromptMessage() {
  return (
    '🧠 MEMORY GATE: Before ending the session, evaluate this session\'s work.\n\n' +
    'For each issue you worked on and closed, ask:\n' +
    '  Is this a stable pattern, key decision, or solution I\'ll encounter again?\n\n' +
    '  YES → bd remember "<precise, durable insight>"\n' +
    '  NO  → explicitly note "nothing worth persisting" and continue\n\n' +
    'When done, signal completion and stop again:\n' +
    '  touch .beads/.memory-gate-done\n'
  );
}
