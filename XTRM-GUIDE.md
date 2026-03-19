# XTRM-Tools Complete Guide

> **Version 2.4.0** | A comprehensive reference for the XTRM-Tools Claude Code plugin ecosystem.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Plugin Structure](#plugin-structure)
5. [Policy System](#policy-system)
6. [Hooks Reference](#hooks-reference)
7. [Pi Extensions](#pi-extensions)
8. [Skills Catalog](#skills-catalog)
9. [CLI Commands](#cli-commands)
10. [MCP Servers](#mcp-servers)
11. [Issue Tracking with Beads](#issue-tracking-with-beads)
12. [Troubleshooting](#troubleshooting)

---

## Overview

XTRM-Tools is a **Claude Code plugin** that provides workflow enforcement, code quality gates, issue tracking integration, and development automation.

### Key Features

| Feature | Description |
|---------|-------------|
| **Main Guard** | PR-only workflow enforcement, blocks direct edits on protected branches |
| **Beads Gates** | Issue tracking gates — edit, commit, stop, memory gates |
| **Quality Gates** | Automatic linting and type checking on file edits |
| **GitNexus** | Knowledge graph context for code exploration and impact analysis |
| **Service Skills** | Docker service expertise with territory-based skill activation |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Claude Code Session                         │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │   Plugin    │    │   Skills    │    │      MCP Servers        │ │
│  │  (hooks/)   │    │  (skills/)  │    │  (.mcp.json)            │ │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┬───────────┘ │
│         │                  │                         │             │
│         ▼                  ▼                         ▼             │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Policy Compiler                          │  │
│  │            (policies/*.json → hooks.json)                   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Pi Extensions                                │
│   (quality-gates.ts, beads.ts, main-guard.ts, service-skills.ts)   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Installation

### Quick Start

```bash
# One-time global installation
npm install -g github:Jaggerxtrm/xtrm-tools@latest

# Install the plugin + dependencies
xtrm install all

# Verify installation
claude plugin list
# → xtrm-tools@xtrm-tools  Version: 2.3.0  Status: ✔ enabled
```

### One-Line Run

```bash
npx -y github:Jaggerxtrm/xtrm-tools install all
```

### Project Initialization

```bash
cd your-project
xtrm init
# alias: xtrm project init
```

This runs:
- `bd init` — Initializes beads issue tracking
- `gitnexus analyze` (when needed) — indexes or refreshes code graph
- Project MCP server sync for GitNexus
- Project-type detection (TypeScript / Python / Docker)
- `service-registry.json` scaffold/update when Docker services are detected

---

## Plugin Structure

```
plugins/xtrm-tools/
├── .claude-plugin/plugin.json   # Manifest
├── hooks → ../../hooks           # All hook scripts
├── skills → ../../skills         # Auto-discovered skills
└── .mcp.json → ../../.mcp.json   # MCP server definitions
```

### plugin.json

```json
{
  "name": "xtrm-tools",
  "version": "2.3.0",
  "description": "xtrm-tools: workflow enforcement hooks, skills, and MCP servers",
  "mcpServers": "./.mcp.json"
}
```

---

## Policy System

Policies are the **single source of truth** for all enforcement rules.

### Policy Schema

```json
{
  "id": "policy-name",
  "description": "Human-readable description",
  "runtime": "both",           // "claude" | "pi" | "both"
  "order": 10,                 // Execution priority
  "claude": {
    "hooks": [{ "event": "PreToolUse", "matcher": "Write|Edit", "command": "..." }]
  },
  "pi": {
    "extension": "config/pi/extensions/policy-name.ts",
    "events": ["tool_call", "tool_result"]
  }
}
```

### Policy Files

| Policy | Runtime | Order | Purpose |
|--------|---------|-------|---------|
| `main-guard.json` | both | 10 | PR-only workflow, branch protection |
| `beads.json` | both | 20 | Issue tracking gates (edit/commit/memory/compact) |
| `session-flow.json` | both | 25 | Worktree-on-claim + xtrm finish closure enforcement |
| `branch-state.json` | claude | 30 | Branch state injection |
| `gitnexus.json` | claude | 40 | Knowledge graph enrichment |
| `serena.json` | claude | 50 | Serena LSP workflow reminder at session start |
| `quality-gates.json` | pi | 30 | Linting/typechecking |
| `service-skills.json` | pi | 40 | Territory-based skill activation |

### Compiler

```bash
node scripts/compile-policies.mjs           # Write hooks.json
node scripts/compile-policies.mjs --dry-run # Preview
node scripts/compile-policies.mjs --check   # CI drift check
```

---

## Hooks Reference

### Event Types

| Event | When It Fires |
|-------|---------------|
| `SessionStart` | Session begins |
| `UserPromptSubmit` | After user submits prompt |
| `PreToolUse` | Before tool invocation |
| `PostToolUse` | After tool completes |
| `Stop` | Session ends |
| `PreCompact` | Before compaction |

### Main Guard

**Purpose**: Enforces PR-only workflow.

| Event | Matcher | Action |
|-------|---------|--------|
| PreToolUse | Write\|Edit\|MultiEdit\|Serena | Block if on main/master |
| PreToolUse | Bash | Block dangerous git commands |
| PostToolUse | Bash | Remind to use `gh pr merge --squash` |

### Beads Gates

| Hook | Purpose |
|------|---------|
| Edit Gate | Blocks edits without claimed issue |
| Commit Gate | Ensures issues closed before commit |
| Memory Gate | Prompts to persist insights |
| Compact Save/Restore | Preserves claim state across `/compact` |

### Session Flow Gates

| Hook | Purpose |
|------|---------|
| Claim Sync | Creates worktree + `.xtrm-session-state.json` on `bd update <id> --claim` |
| Stop Flow Gate | Blocks stop when phase is `waiting-merge`, `conflicting`, `pending-cleanup` |

#### Intended Worktree-First Flow (Pi + Claude)

1. `bd update <id> --claim` (worktree auto-created)
2. Move your agent session to that worktree path and do all edits there (sandboxed)
3. If you remain on `main`/`master`, `main-guard` blocks mutating tools and points to active worktree path
4. Run `xtrm finish` to complete closure lifecycle (commit/push/pr/merge/cleanup)

> `xtrm finish` is allowed on protected branches and resolves execution context from `.xtrm-session-state.json`.
> If invoked from repo root, it executes git/gh phase steps in the claimed worktree path.

### GitNexus Hook

Enriches tool output with knowledge graph context via `gitnexus augment`.

---

## Pi Extensions

| Extension | Events | Purpose |
|-----------|--------|---------|
| `main-guard.ts` | tool_call | Branch protection (blocks dangerous tool calls) |
| `main-guard-post-push.ts` | tool_result | Post-push PR workflow reminders |
| `beads.ts` | session_start, tool_call, tool_result, agent_end, session_shutdown | Issue tracking gates + memory gate |
| `session-flow.ts` | tool_result, agent_end | Worktree claim flow + finish lifecycle reminders |
| `quality-gates.ts` | tool_result | Linting/typechecking after file edits |
| `service-skills.ts` | before_agent_start, tool_result | Territory-based skill activation |

---

## Skills Catalog

### Global Skills (`skills/` → `~/.agents/skills/`)

| Skill | Purpose |
|-------|---------|
| `using-xtrm` | Session operating manual — read at session start |
| `test-planning` | Plan test issues alongside implementation work |
| `documenting` | SSOT documentation with drift detection |
| `delegating` | Task delegation to cost-optimized agents |
| `orchestrating-agents` | Multi-model collaboration (Gemini, Qwen) |
| `clean-code` | Pragmatic coding standards |
| `hook-development` | Claude Code plugin hook authoring |
| `skill-creator` | Create and evaluate new skills |
| `find-skills` | Discover and install skills |
| `prompt-improving` | Claude XML prompt optimization |
| `using-serena-lsp` | Serena LSP workflow guide |
| `using-TDD` | TDD workflow enforcement |
| `python-testing` | Pytest strategies and TDD |
| `senior-backend` | Backend development expertise |
| `senior-data-scientist` | Data science and analytics |
| `senior-devops` | DevOps and infrastructure |
| `senior-security` | Security engineering |
| `docker-expert` | Docker containerization |
| `obsidian-cli` | Obsidian vault CLI integration |
| `gitnexus-debugging` | Debug with knowledge graph |
| `gitnexus-exploring` | Navigate code with knowledge graph |
| `gitnexus-impact-analysis` | Blast radius analysis |
| `gitnexus-refactoring` | Safe refactor planning |

### Project Data (`xtrm init` provisions this per repository)

| Data | Purpose |
|------|---------|
| `.beads/` | Beads issue DB and claim-state backing store |
| `service-registry.json` | Service metadata used by global service-skills routing |
| GitNexus index | Project code graph for context/impact analysis |

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `install all` | Full plugin + beads + gitnexus |
| `install basic` | Plugin + skills (no beads) |
| `init` | Initialize current project (alias for `project init`) |
| `project init` | Initialize project data for global hooks/skills |
| `install project <name>` | **Deprecated** legacy project-skill installer |
| `status` | Read-only diff view |
| `finish` | Blocking session closure: phase1 + PR poll + cleanup |
| `clean` | Remove orphaned hooks |
| `reset` | Clear preferences |

### Flags

| Flag | Description |
|------|-------------|
| `--yes`, `-y` | Non-interactive |
| `--dry-run` | Preview only |
| `--prune` | Force-replace hooks |
| `--force` | Overwrite existing |

---

## MCP Servers

| Server | Purpose |
|--------|---------|
| `serena` | Code analysis via LSP |
| `context7` | Documentation lookup |
| `github-grep` | Code search |
| `deepwiki` | Technical documentation |
| `gitnexus` | Knowledge graph |

---

## Issue Tracking with Beads

```bash
bd ready                    # Find unblocked work
bd update <id> --claim      # Claim an issue
bd close <id> --reason "Done"  # Close when done
```

### Issue Types

| Type | Description |
|------|-------------|
| `bug` | Something broken |
| `feature` | New functionality |
| `task` | Work item |
| `epic` | Large feature |
| `chore` | Maintenance |

---

## Troubleshooting

### Plugin Not Loading

```bash
claude plugin list
claude plugin validate /path/to/xtrm-tools/plugins/xtrm-tools
```

### Hooks Not Firing

```bash
node scripts/compile-policies.mjs --check
```

### Beads Issues

```bash
which bd && which dolt
bd status
```

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 2.4.0 | 2026-03-18 | Session-flow policy (runtime:both), worktree-first claim sync, `.xtrm-session-state.json`, `xtrm finish` command, stop-gate phase enforcement, compact save/restore continuity |
| 2.3.0 | 2026-03-18 | Plugin structure, policy compiler, Pi extension parity, manifest hash drift detection, MCP sync refactor (`syncMcpForTargets`), commit gate stale-claim fix, context7 free stdio transport |
| 2.2.0 | 2026-03-17 | Pi extensions: quality-gates, beads, main-guard |
| 2.0.0 | 2026-03-12 | CLI rebrand, project skills engine |
| 1.7.0 | 2026-02-25 | GitNexus integration |

See [CHANGELOG.md](CHANGELOG.md) for full history.

---

## License

MIT License
