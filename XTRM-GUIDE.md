# XTRM-Tools Guide

> Current operational guide for Claude hooks + Pi extensions.

## Overview

XTRM-Tools provides:
- policy-driven Claude hooks (`policies/*.json` → `hooks/hooks.json`)
- Pi extensions (`config/pi/extensions/*.ts`)
- beads workflow integration (`bd`)
- quality gates and graph/tooling integrations

---

## Current Policy Set

| Policy | Runtime | Purpose |
|---|---|---|
| `beads.json` | both | Edit/commit/stop/memory/compact gates |
| `session-flow.json` | both | Session flow behavior (Pi now centered on `bd close` auto-commit) |
| `branch-state.json` | claude | Inject branch/claim context into prompt |
| `gitnexus.json` | claude | Graph-aware enrichment |
| `serena.json` | claude | Serena workflow reminder |
| `quality-gates.json` | pi | Lint/type check extension wiring |
| `service-skills.json` | pi | Service-skill activation wiring |

`main-guard.json` is intentionally removed from active policy wiring.

---

## Pi Extensions (current)

| Extension | Events | Purpose |
|---|---|---|
| `beads.ts` | `session_start, tool_call, tool_result, agent_end, session_shutdown` | Beads edit/commit/memory gates |
| `session-flow.ts` | `tool_result, agent_end` | `bd close`-driven auto-commit flow |
| `quality-gates.ts` | `tool_result` | Post-edit quality checks |
| `service-skills.ts` | `before_agent_start, tool_result` | Service-routing context |
| `main-guard-post-push.ts` | `tool_result` | Post-push reminder text only |

Pi installer excludes deprecated main-guard extension deployment.

---

## Session Flow (Pi, current)

### Claim
- `bd update <id> --claim` is issue ownership.
- Claim no longer bootstrap-creates worktree/session-state in Pi session-flow extension.

### Close
- `bd close <id> --reason "..."` is canonical close action.
- Pi session-flow now attempts auto-commit on successful close:
  - reads `close_reason`
  - runs `git add -A`
  - runs `git commit -m "<close_reason> (<id>)"`
  - no-op if there are no changes

### Publish / Merge
- Publish/merge are explicit external steps (publish-only workflow).
- Automatic `xtrm finish` orchestration is deprecated in Pi guidance.

---

## Policy Compiler

```bash
node scripts/compile-policies.mjs
node scripts/compile-policies.mjs --check
node scripts/compile-policies.mjs --check-pi
```

---

## Beads Quick Reference

```bash
bd ready
bd update <id> --claim
bd close <id> --reason "Done"
bd remember "<insight>"
```

---

## Notes

- If behavior seems stale after edits, reload/restart client session so updated extension code is loaded.
- Historical worktree-first + `xtrm finish` docs are being phased out in favor of explicit xtpi/publish workflow.
