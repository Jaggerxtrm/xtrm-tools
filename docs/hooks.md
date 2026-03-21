---
title: Hooks Reference
scope: hooks
category: reference
version: 1.3.0
updated: 2026-03-21
synced_at: 9a29306
description: "All hook events, scripts, and behavior for the xtrm plugin"
source_of_truth_for:
  - "hooks/**/*.mjs"
  - "hooks/**/*.py"
  - "policies/*.json"
domain: [hooks, claude, enforcement]
---

# Hooks Module

This document covers the `hooks/` directory: which scripts run, on which events, and how they interact.

Hook scripts are delivered via the xtrm-tools Claude Code plugin. All paths use `${CLAUDE_PLUGIN_ROOT}` so they work from any installation location.

## Event Model

| Event | When |
|-------|------|
| `SessionStart` | Session begins |
| `PreToolUse` | Before a tool call executes |
| `PostToolUse` | After a tool call completes |
| `Stop` | Session ends |
| `PreCompact` | Before context compaction |

## Hook Groups

### General Hooks

Always installed (`xtrm install`).

| Hook | Event | Behavior |
|------|-------|----------|
| `serena-workflow-reminder.py` | SessionStart | Injects Serena LSP semantic editing reminder |
| `gitnexus/gitnexus-hook.cjs` | PostToolUse | Enriches Bash/Grep/Read/Glob/Serena tool output with GitNexus graph context |
| `quality-check.cjs` | PostToolUse | Runs tsc/ESLint checks after JS/TS/CJS/MJS file edits |
| `quality-check.py` | PostToolUse | Runs ruff/mypy checks after Python file edits |
| `quality-check-env.mjs` | SessionStart | Warns if tsc/ruff/eslint are missing so gate degradation is caught early |

### Beads Gate Hooks

Installed with `xtrm install` when beads + dolt are present.

| Hook | Event | Behavior |
|------|-------|----------|
| `beads-edit-gate.mjs` | PreToolUse | Blocks file edits when no beads issue is claimed |
| `beads-commit-gate.mjs` | PreToolUse | Blocks `git commit` when claimed issue is still in_progress |
| `beads-stop-gate.mjs` | Stop | Blocks session end when there is an unclosed in_progress claim |
| `beads-memory-gate.mjs` | Stop | Prompts to persist insights when a claim was closed this session |
| `beads-compact-save.mjs` | PreCompact | Saves claim state before `/compact` |
| `beads-compact-restore.mjs` | SessionStart | Restores claim state after `/compact` or session resume |

### Worktree Boundary Hook

| Hook | Event | Behavior |
|------|-------|----------|
| `worktree-boundary.mjs` | PreToolUse | Blocks Write/Edit outside `.xtrm/worktrees/<name>` when in worktree session |

Active only when cwd is inside a worktree (detected via path matching `.xtrm/worktrees/<name>`). Fail-open: any error allows the edit through.

### Session Flow Hooks

| Hook | Event | Behavior |
|------|-------|----------|
| `beads-claim-sync.mjs` | PostToolUse | Notifies on `bd update --claim`; auto-commits on `bd close` (stages untracked files first) |

### Statusline Hook

| Hook | Event | Behavior |
|------|-------|----------|
| `statusline.mjs` | statusLine | Renders 2-line status: `XTRM model dir branch` + claim/open issues |

Runs via Claude Code's `statusLine` injection. Reads claim state from `.xtrm/statusline-claim`, shows model name, context %, git branch + status, and either active claim title or open issue count.

### Shared Utilities (not wired directly)

| File | Purpose |
|------|---------|
| `beads-gate-core.mjs` | Core gate decision logic (commit gate, stop gate) |
| `beads-gate-utils.mjs` | Claim resolution, work-state helpers |
| `beads-gate-messages.mjs` | Shared message formatting for gate blocks |
| `xtrm-logger.mjs` | Event logger for hooks/bd lifecycle — writes to `xtrm_events` table in beads Dolt DB |

## Claim Workflow

```bash
# Claim an issue
bd update <id> --claim

# Work, edit, commit normally
# ...

# Close when done
bd close <id> --reason "Done"
```

- `beads-edit-gate` blocks edits until an issue is claimed
- `beads-commit-gate` blocks commits until the claimed issue is closed
- `beads-stop-gate` blocks session end while a claim is in_progress
- `beads-memory-gate` fires at Stop if a claim was closed this session, prompting memory persistence

Acknowledge the memory gate with:
```bash
touch .beads/.memory-gate-done
```

## Compact / Resume Continuity

`beads-compact-save.mjs` fires at `PreCompact` and saves the current claim ID to a KV key. `beads-compact-restore.mjs` fires at `SessionStart` and restores it — so gates remain active across `/compact` and session resume.

## Installation

```bash
xtrm install            # Interactive — selects targets including beads gates
xtrm install --dry-run  # Preview without changes
```

Gates that depend on `bd` + `dolt` are skipped automatically if those binaries are not present.

## Policy Source

Hook wiring is compiled from `policies/*.json` via:

```bash
node scripts/compile-policies.mjs           # Regenerate hooks/hooks.json
node scripts/compile-policies.mjs --check   # CI drift detection
```

The compiled output lives in `hooks/hooks.json` and is committed to the repository.

## Troubleshooting

**Edits blocked unexpectedly:**
```bash
bd list --status=in_progress   # check for open claims
bd kv list | grep claimed      # check raw KV state
```

**Commit blocked after closing issue:**
```bash
bd kv list | grep claimed      # stale KV entry may exist
bd kv clear "claimed:<session_id>"  # clear it manually
```

**Hooks not running:**
```bash
claude plugin list             # verify xtrm-tools is enabled
node scripts/compile-policies.mjs --check  # verify hooks.json is current
```

## Related Docs

- [XTRM-GUIDE.md](../XTRM-GUIDE.md) — Complete reference
- [pi-extensions.md](pi-extensions.md) — Pi-side equivalents
- [policies.md](policies.md) — Policy system overview
