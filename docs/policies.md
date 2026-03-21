---
title: Policy Reference
scope: policies
category: reference
version: 1.2.0
updated: 2026-03-21
source_of_truth_for:
  - "policies/*.json"
domain: [hooks, enforcement]
---

# Policy Reference

Policies in `policies/*.json` are the single source of truth for hook wiring. They are compiled into `hooks/hooks.json` via:

```bash
node scripts/compile-policies.mjs           # regenerate
node scripts/compile-policies.mjs --check   # CI drift detection
```

Each policy declares which runtime it targets (`claude`, `pi`, or `both`) and which hooks/events to wire.

## Policies

| Policy | Runtime | Description |
|--------|---------|-------------|
| `beads.json` | both | Issue tracking enforcement — edit gate, commit gate, stop gate, memory gate, compact save/restore |
| `branch-state.json` | claude | Injects current git branch + beads claim state into every user prompt turn |
| `gitnexus.json` | claude | Auto-augments Bash/Grep/Read/Glob/Serena tool results with GitNexus graph context |
| `quality-gates.json` | both | Runs tsc/ESLint/ruff/mypy after mutating file edits (JS/TS/CJS/MJS + Python) |
| `quality-gates-env.json` | claude | Verifies tsc/eslint/ruff are available at session start; warns if enforcement would be silently degraded |
| `serena.json` | claude | Injects Serena LSP workflow reminder at session start |
| `service-skills.json` | pi | Injects service catalog + detects skill doc drift (only when `service-registry.json` present) |
| `session-flow.json` | both | Claim sync (auto-commit on `bd close`), stop gate, `xt end` worktree reminder |
| `using-xtrm.json` | claude | Injects `using-xtrm` session operating manual at session start |
| `worktree-boundary.json` | claude | Blocks Write/Edit outside active worktree when inside `.xtrm/worktrees/<name>` |

## Adding a Policy

1. Create `policies/<id>.json` following the schema in `policies/schema.json`
2. Run `node scripts/compile-policies.mjs`
3. Add the hook script to `CANONICAL_HOOKS` in `cli/src/commands/clean.ts`
4. Commit both `policies/<id>.json` and the regenerated `hooks/hooks.json`

## Related Docs

- [hooks.md](hooks.md) — Hook scripts reference
- [pi-extensions.md](pi-extensions.md) — Pi-side policy equivalents
