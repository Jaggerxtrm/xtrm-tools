---
title: Pi Extensions Reference
scope: pi-extensions
category: reference
version: 1.1.0
updated: 2026-03-19
source_of_truth_for:
  - "config/pi/extensions/**/*.ts"
domain: [pi, extensions]
---

# Pi Extensions Reference

## Active Extensions (current)

| Extension | Event(s) | Purpose |
|---|---|---|
| `beads.ts` | `session_start`, `tool_call`, `tool_result`, `agent_end`, `session_shutdown` | Beads edit/commit/memory gating |
| `session-flow.ts` | `tool_result`, `agent_end` | `bd close` auto-commit flow; no claim-time worktree bootstrap |
| `quality-gates.ts` | `tool_result` | Post-edit quality checks |
| `service-skills.ts` | `before_agent_start`, `tool_result` | Service skill routing/reminders |
| `main-guard-post-push.ts` | `tool_result` | Informational post-push reminder text |

## Behavioral Notes

- `bd close` is canonical close action.
- Session-flow auto-commit tries to reuse `close_reason` for commit message.
- Publish/merge are explicit external steps (publish-only workflow).
- Deprecated main-guard extension files are excluded from Pi installer deployment.
