---
title: Policy Reference
scope: policies
category: reference
version: 1.2.0
updated: 2026-03-20
source_of_truth_for:
  - "policies/*.json"
domain: [policies, hooks, pi]
---

# Policy Reference

Policies define runtime wiring for Claude hooks and Pi extensions.

## Active Policies

| Policy | Runtime | Order | Result |
|---|---|---|---|
| `beads.json` | both | 20 | Beads gates for edit/commit/stop/memory/compact |
| `session-flow.json` | both | 25 | Session-flow logic wiring (`bd close` auto-commit path) |
| `branch-state.json` | claude | 30 | Branch/claim context injection |
| `quality-gates.json` | pi | 30 | Pi quality-gates extension wiring |
| `gitnexus.json` | claude | 40 | GitNexus hook wiring |
| `service-skills.json` | pi | 40 | Pi service-skills extension wiring |
| `serena.json` | claude | 50 | Serena reminder hook wiring |

## Compiler

```bash
node scripts/compile-policies.mjs
node scripts/compile-policies.mjs --check
node scripts/compile-policies.mjs --check-pi
```

## Current stance

- `main-guard.json` is removed from active policy set.
- `bd close` remains canonical close command.
- Workflow docs should prefer publish-only/external merge guidance over finish orchestration.