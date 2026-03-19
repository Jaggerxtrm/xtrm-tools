---
title: Hooks Reference
scope: hooks
category: reference
version: 1.1.0
updated: 2026-03-19
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
| `beads-stop-gate.mjs` | Blocks stop when unresolved claim/phase requires follow-up |
| `beads-memory-gate.mjs` | Stop-time memory prompt gate |
| `beads-claim-sync.mjs` | Syncs claim/close markers from `bd` tool results |

### Context / Tooling

| Hook | Behavior |
|---|---|
| `branch-state.mjs` | Injects branch + claim context on prompt submit |
| `gitnexus/gitnexus-hook.cjs` | Graph-aware augment guidance |
| `serena-workflow-reminder.py` | Session-start Serena workflow reminder |
| `quality-check.cjs` / `quality-check.py` | Post-edit quality checks |

## Operational Flow (current)

```bash
bd update <id> --claim
# ...work...
bd close <id> --reason "..."
```

- Edits are blocked without claim when work exists.
- Close marks session progress for memory prompt behavior.
- Memory prompt asks whether to persist insight via `bd remember`.

## Notes

- Main-guard policy is no longer part of active compiled hook wiring.
- If wiring appears stale, run `node scripts/compile-policies.mjs --check`.
