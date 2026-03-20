---
title: Hooks Reference
scope: hooks
category: reference
version: 1.2.0
updated: 2026-03-20
description: "Active Claude hook wiring and behavior"
source_of_truth_for:
  - "hooks/**/*.mjs"
  - "hooks/**/*.py"
  - "policies/*.json"
domain: [hooks, claude, enforcement]
---

# Hooks Module

This document describes active Claude hooks generated from `policies/*.json`.

## Active Hook Groups

### Workflow / Beads

| Hook | Behavior |
|---|---|
| `beads-edit-gate.mjs` | Blocks edits without session claim when trackable work exists |
| `beads-commit-gate.mjs` | Blocks commit while claimed in-progress work remains |
| `beads-stop-gate.mjs` | Stop-time claim workflow gate |
| `beads-memory-gate.mjs` | Stop-time memory reflection gate |
| `beads-claim-sync.mjs` | Syncs claim/close markers from `bd` command results |
| `beads-compact-save.mjs` / `beads-compact-restore.mjs` | Persist/restore compact context |

### Context / Tooling

| Hook | Behavior |
|---|---|
| `branch-state.mjs` | Injects branch + claim context on prompt submit |
| `gitnexus/gitnexus-hook.cjs` | GitNexus guidance/enrichment |
| `serena-workflow-reminder.py` | Session-start Serena workflow reminder |
| `quality-check.cjs` / `quality-check.py` | Post-edit quality checks |

## Operational Flow

```bash
bd update <id> --claim
# ...work...
bd close <id> --reason "..."
```

- Edits are blocked without claim when work exists.
- Close state participates in memory prompt behavior.
- Memory prompt supports persisting insight via `bd remember`.

## Notes

- Main-guard policy is no longer part of active compiled hook wiring.
- If wiring appears stale, run `node scripts/compile-policies.mjs --check`.