---
title: .xtrm Directory Reference
scope: xtrm-directory
category: reference
version: 1.1.0
updated: 2026-04-04
synced_at: e6cca025
description: "Centralized xtrm configuration and runtime data directory"
source_of_truth_for:
  - ".xtrm/**"
domain: [config, xtrm]
---

<!-- INDEX: auto-generated -->
| Section | Summary |
|---|---|
| [Overview](#overview) | `.xtrm/` is the canonical location for all xtrm-managed project data |
| [Directory Layout](#directory-layout) | `skills/`, `hooks/`, `ext-src/`, `worktrees/`, `reports/`, `cache/`, `config/` |
| [What Moved Here](#what-moved-here) | Previously scattered across `.claude/`, `.agents/`, `.pi/` |
| [Extension Architecture](#extension-architecture) | Global symlink model — Pi loads from ~/.pi/agent/extensions/ |
---

# .xtrm Directory Reference

## Overview

`.xtrm/` is the **canonical location** for all xtrm-managed project data. Previously, xtrm assets were scattered across multiple directories:

| Old Location | New Location | Contents |
|---|---|---|
| `.claude/hooks/` | `.xtrm/hooks/` | Hook scripts |
| `.claude/settings.json` hooks | `.xtrm/hooks/` + policy compile | Hook configuration |
| `.agents/skills/` | `.xtrm/skills/` | Skills tier architecture |
| `.pi/extensions/` symlink | `.xtrm/ext-src/` + global symlinks | Pi extension packages |
| `.pi/skills/` | `.xtrm/skills/active/pi/` | Runtime active view |
| Worktree sibling dirs | `.xtrm/worktrees/` | Git worktrees |

## Directory Layout

```
.xtrm/
├── skills/              # Skills tier architecture
│   ├── default/         # → ../../skills (symlink)
│   ├── optional/        # Optional packs (managed; populated by `xt install`)
│   ├── user/packs/      # User packs (writable)
│   ├── active/
│   │   ├── claude/      # Claude runtime active view
│   │   └── pi/          # Pi runtime active view
│   ├── state.json       # Runtime enablement state
│   └── INVARIANTS.md    # Contract documentation
│
├── hooks/               # Hook scripts and compiled config
│   ├── *.mjs            # Hook scripts
│   ├── *.py             # Python hooks
│   └── hooks.json       # Compiled hook configuration
│
├── ext-src/             # Pi extension source (git-tracked)
│   ├── core/            # @xtrm/pi-core shared library
│   │   ├── adapter.ts
│   │   ├── guard-rules.ts
│   │   ├── lib.ts
│   │   ├── logger.ts
│   │   ├── runner.ts
│   │   ├── session-state.ts
│   │   └── package.json
│   ├── beads/           # Extension packages
│   │   ├── index.ts
│   │   └── package.json
│   ├── session-flow/
│   ├── quality-gates/
│   ├── custom-footer/
│   ├── xtrm-loader/
│   ├── xtrm-ui/
│   └── ...              # Other managed extensions
│
├── worktrees/           # Git worktrees for sessions
│   └── <branch>/        # Per-branch worktree
│
├── reports/             # Session close reports
│   └── <date>-<hash>.md
│
├── cache/               # Runtime cache
│
├── config/              # Project-local config
│
├── registry.json        # Service registry
│
└── debug.db             # SQLite debug log
```

## What Lives Here

| Subdirectory | Purpose | Managed by |
|---|---|---|
| `skills/` | Three-tier skill model | `xt init`, `xt skills` |
| `hooks/` | Hook scripts + compiled config | Policy compile, `xt install` |
| `ext-src/` | Pi extension source code | `xt pi install` (syncs via global symlinks) |
| `worktrees/` | Session worktrees | `xt worktree`, `xt pi`, `xt claude` |
| `reports/` | Session handoff reports | `xt report generate` |
| `registry.json` | Service registry | Service-skills system |

## Extension Architecture

Pi extensions follow a **global symlink model**:

1. **Source**: `.xtrm/ext-src/<name>/` contains the extension source (git-tracked)
2. **Global symlink**: `~/.pi/agent/extensions/<name>` → `.xtrm/ext-src/<name>/`
3. **Pi loads from global only** — no project-level conflicts

This means:
- Worktrees automatically share extensions with the main repo (no bootstrap needed)
- Multiple projects using the same xtrm-tools version share extensions
- No duplicate discovery issues (Pi only sees global directory)

The directory is named `ext-src` (not `extensions`) to prevent Pi from auto-discovering project-level extensions. If `.xtrm/extensions/` existed, Pi would load duplicates.

## Deprecation Notes

The following paths are **deprecated** and should not be used:

- `.agents/skills/` — migrated to `.xtrm/skills/`
- `.pi/skills/` — migrated to `.xtrm/skills/active/pi/`
- `.xtrm/extensions/` — renamed to `.xtrm/ext-src/` in v0.7.3
- `.pi/node_modules/@xtrm/pi-core` — migrated to `.xtrm/ext-src/core/`

The `xt init` command automatically symlinks `.claude/skills` and `.agents/skills` to `.xtrm/skills/default/` for backward compatibility.

Optional packs under `.xtrm/skills/optional/` are now populated by default during `xt install`; enable runtime activation with `xt skills enable <pack>`.

## Related Docs

- [skills-tier-architecture.md](skills-tier-architecture.md) — Skills architecture
- [hooks.md](hooks.md) — Hook configuration
- [pi-extensions.md](pi-extensions.md) — Pi extensions
- [worktrees.md](worktrees.md) — Worktree sessions
