---
title: Pi Extensions Reference
scope: pi-extensions
category: reference
version: 1.2.0
updated: 2026-03-20
source_of_truth_for:
  - "config/pi/extensions/**/*.ts"
domain: [pi, extensions]
---

# Pi Extensions Reference

## Active Extensions

| Extension | Event(s) | Purpose |
|---|---|---|
| `beads.ts` | `session_start`, `tool_call`, `tool_result`, `agent_end`, `session_shutdown`, `session_before_switch`, `session_before_fork`, `session_before_compact` | Claim/edit/commit/memory gate enforcement |
| `session-flow.ts` | `tool_result`, `agent_end` | `bd close` auto-commit from close reason |
| `quality-gates.ts` | `tool_result` | Post-edit quality checks |
| `service-skills.ts` | `before_agent_start`, `tool_result` | Service skill routing/reminders |
| `main-guard-post-push.ts` | `tool_result` | Informational post-push reminder text |

## Beads + Memory Gate behavior

- `bd update --claim` stores active claim for session.
- Successful `bd close` stores `closed-this-session:<sessionId>` and appends memory guidance.
- Acknowledge memory gate with:

```bash
touch .beads/.memory-gate-done
```

While pending (closed-this-session exists and marker not touched):
- mutating tool calls are blocked
- `session_before_switch` is canceled
- `session_before_fork` is canceled
- `session_before_compact` is canceled

On marker acknowledgment:
- marker file is consumed
- `claimed:<sessionId>` and `closed-this-session:<sessionId>` are cleared

## Session-flow behavior

- `bd close <id> --reason "..."` is canonical close event.
- Pi derives commit text from close reason:
  - `"<close_reason> (<id>)"`
- No-change close is a clean no-op (auto-commit skipped).
- Publish/merge are intentionally external steps.

## Notes

- Main-guard policy wiring is not active in current runtime.
- If extension behavior appears stale, reload/restart the Pi session to reload extension code.