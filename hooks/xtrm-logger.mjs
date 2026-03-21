#!/usr/bin/env node
// xtrm-logger.mjs — shared event logger for xtrm hook and bd lifecycle events
//
// Writes to the xtrm_events table in the project's beads Dolt DB.
// Self-initializing: creates the table on first write if it doesn't exist.
// Fails completely silently — logging NEVER affects hook behavior.
//
// Usage (from any hook):
//   import { logEvent } from './xtrm-logger.mjs';
//   logEvent({ cwd, runtime: 'claude', sessionId, layer: 'gate', kind: 'hook.edit_gate.block',
//              outcome: 'block', toolName, issueId, message, extra });

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// ── Schema ────────────────────────────────────────────────────────────────────

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS xtrm_events (
  id          VARCHAR(36)   NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  runtime     VARCHAR(16)   NOT NULL,
  session_id  VARCHAR(255)  NOT NULL,
  worktree    VARCHAR(255)  DEFAULT NULL,
  layer       VARCHAR(16)   NOT NULL,
  kind        VARCHAR(64)   NOT NULL,
  outcome     VARCHAR(8)    NOT NULL,
  tool_name   VARCHAR(255)  DEFAULT NULL,
  issue_id    VARCHAR(255)  DEFAULT NULL,
  message     TEXT          DEFAULT NULL,
  extra       JSON          DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_session (session_id(64)),
  INDEX idx_kind (kind),
  INDEX idx_created (created_at)
)`;

// ── SQL helpers ───────────────────────────────────────────────────────────────

/**
 * Escape a value for use in a MySQL single-quoted string literal.
 * Returns the quoted string, or NULL for null/undefined.
 */
function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  const str = String(val)
    .replace(/\\/g, '\\\\')   // backslash first
    .replace(/'/g, "''")      // single-quote → doubled
    .replace(/\0/g, '');      // strip null bytes (invalid in utf8 strings)
  return `'${str}'`;
}

function bdSql(sql, cwd) {
  return spawnSync('bd', ['sql', sql], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 5000,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Log an xtrm event to the beads xtrm_events table.
 *
 * @param {object}  params
 * @param {string}  params.cwd         Project working directory (required)
 * @param {string}  params.runtime     'claude' | 'pi'
 * @param {string}  params.sessionId   Claude session UUID or Pi PID string
 * @param {string}  params.layer       'gate' | 'bd'
 * @param {string}  params.kind        e.g. 'hook.edit_gate.block', 'bd.claimed'
 * @param {string}  params.outcome     'allow' | 'block'
 * @param {string}  [params.toolName]  Tool intercepted (gates)
 * @param {string}  [params.issueId]   Linked beads issue ID
 * @param {string}  [params.message]   Full message sent to agent (blocks)
 * @param {object}  [params.extra]     Additional structured data {file, cwd, reason_code, ...}
 *
 * @returns {string|null} The event UUID, or null if logging failed
 */
export function logEvent(params) {
  try {
    const { cwd, runtime, sessionId, layer, kind, outcome } = params;
    if (!cwd || !runtime || !sessionId || !layer || !kind || !outcome) return null;

    const { toolName, issueId, message, extra } = params;

    // Derive worktree name if cwd is inside .xtrm/worktrees/<name>
    const worktreeMatch = cwd.match(/\.xtrm\/worktrees\/([^/]+)/);
    const worktree = worktreeMatch ? worktreeMatch[1] : null;

    const id = randomUUID();
    const extraJson = extra ? JSON.stringify(extra) : null;

    const cols = 'id, runtime, session_id, worktree, layer, kind, outcome, tool_name, issue_id, message, extra';
    const vals = [
      sqlEscape(id),
      sqlEscape(runtime),
      sqlEscape(sessionId),
      sqlEscape(worktree),
      sqlEscape(layer),
      sqlEscape(kind),
      sqlEscape(outcome),
      sqlEscape(toolName ?? null),
      sqlEscape(issueId ?? null),
      sqlEscape(message ?? null),
      sqlEscape(extraJson),
    ].join(', ');

    const insertSql = `INSERT INTO xtrm_events (${cols}) VALUES (${vals})`;

    let result = bdSql(insertSql, cwd);
    if (result.status !== 0) {
      // Table may not exist yet — create it and retry once (self-initializing)
      bdSql(CREATE_SQL, cwd);
      result = bdSql(insertSql, cwd);
    }

    return result.status === 0 ? id : null;
  } catch {
    // Silently swallow all errors — logging never affects hook behavior
    return null;
  }
}
