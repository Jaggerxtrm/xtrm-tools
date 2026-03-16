#!/usr/bin/env node
// beads-gate-messages.mjs — centralized message templates for beads gate hooks
// Import from sibling hooks using: import { ... } from './beads-gate-messages.mjs';
//
// All user-facing strings live here. Edit this file to change messaging.
// Policy logic lives in beads-gate-core.mjs.

// ── Shared workflow steps ────────────────────────────────────────────

export const WORKFLOW_STEPS =
  '  1. git checkout -b feature/<name>\n' +
  '  2. bd update <id> --claim\n' +
  '  3. Edit / write code\n' +
  '  4. bd close <id>\n' +
  '  5. git add -p && git commit -m "<message>"\n' +
  '  6. git push -u origin feature/<name>\n' +
  '  7. gh pr create --fill && gh pr merge --squash\n' +
  '  8. git checkout master && git reset --hard origin/master\n';

export const SESSION_CLOSE_PROTOCOL =
  '  bd close <id>\n' +
  '  git add -p && git commit -m "<message>"\n' +
  '  git push -u origin <feature-branch>\n' +
  '  gh pr create --fill && gh pr merge --squash\n';

export const COMMIT_NEXT_STEPS =
  '  bd close <id>\n' +
  '  git add -p && git commit -m "<message>"\n' +
  '  git push -u origin <feature-branch>\n' +
  '  gh pr create --fill && gh pr merge --squash\n';

// ── Edit gate messages ───────────────────────────────────────────

export function editBlockMessage(sessionId) {
  return (
    '🚫 No active claim — claim an issue first.\n' +
    '  bd update <id> --claim\n'
  );
}

export function editBlockFallbackMessage() {
  return (
    '🚫 No active issue — create one before editing.\n' +
    '  bd create --title="<task>" --type=task --priority=2\n' +
    '  bd update <id> --claim\n'
  );
}

// ── Commit gate messages ─────────────────────────────────────────

export function commitBlockMessage(summary, claimed) {
  const issueSummary = summary ?? `  Claimed: ${claimed}`;
  return (
    '🚫 Close open issues before committing.\n\n' +
    `${issueSummary}\n\n` +
    'Next steps:\n' + COMMIT_NEXT_STEPS
  );
}

// ── Stop gate messages ───────────────────────────────────────────

export function stopBlockMessage(summary, claimed) {
  const issueSummary = summary ?? `  Claimed: ${claimed}`;
  return (
    '🚫 Unresolved issues — close before stopping.\n\n' +
    `${issueSummary}\n\n` +
    'Next steps:\n' + SESSION_CLOSE_PROTOCOL
  );
}

// ── Memory gate messages ─────────────────────────────────────────

export function memoryPromptMessage() {
  return (
    '🧠 Memory gate: for each closed issue, worth persisting?\n' +
    '  YES → bd remember "<insight>"   NO → note "nothing to persist"\n' +
    '  touch .beads/.memory-gate-done when done.\n'
  );
}
