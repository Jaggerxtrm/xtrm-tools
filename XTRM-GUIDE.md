# XTRM-Tools Complete Guide

> **Version 0.5.10** | A comprehensive reference for the XTRM-Tools Claude Code plugin ecosystem.

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
│   (quality-gates.ts, beads.ts, session-flow.ts, service-skills.ts) │
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
# → xtrm-tools@xtrm-tools  Version: 0.5.10  Status: ✔ enabled
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
  "version": "0.5.10",
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
| `session-flow.json` | both | 19 | Claim sync, stop gate (blocks with unclosed in_progress claim), `xt end` reminder in worktrees |
| `beads.json` | both | 20 | Issue tracking gates (edit/commit/memory/compact) |
| `branch-state.json` | claude | 30 | Branch state injection |
| `quality-gates.json` | both | 30 | Linting/typechecking |
| `gitnexus.json` | claude | 40 | Knowledge graph enrichment |
| `service-skills.json` | pi | 40 | Territory-based skill activation |
| `serena.json` | claude | 50 | Serena LSP workflow reminder at session start |

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
| Claim Sync | Notifies when `bd update --claim` runs; notes which issue is claimed |
| Stop Gate | Blocks agent stop when there is an unclosed in_progress claim |
| `xt end` Reminder | When session ends inside a worktree, prompts to run `xt end` |

#### Intended Worktree-First Flow (Pi + Claude)

1. `bd update <id> --claim` — claim the issue
2. Work in the claimed branch/worktree (created manually or via `xt claude`/`xt pi`)
3. Run `xt end` from within the worktree to complete closure lifecycle (commit/push/pr/merge/cleanup)

### GitNexus Hook

Enriches tool output with knowledge graph context via `gitnexus augment`.

---

## Pi Extensions

| Extension | Events | Purpose |
|-----------|--------|---------|
| `beads.ts` | session_start, tool_call, tool_result, agent_end, session_shutdown | Issue tracking gates + memory gate |
| `session-flow.ts` | tool_result, agent_end | Claim sync, stop gate, `xt end` reminder in worktrees |
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
| `xt claude` | Launch Claude Code in current worktree |
| `xt pi` | Launch Pi in current worktree |
| `xt worktree list` | List all active worktrees |
| `xt worktree clean` | Remove stale/merged worktrees |
| `xt worktree remove` | Remove a specific worktree |
| `xt end` | Blocking session closure: commit/push/pr/merge/cleanup |
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
| 0.5.10 | 2026-03-21 | Install cleanup: `cleanStalePrePluginFiles()` removes stale `~/.claude/hooks/` + `~/.claude/skills/` on install; Qwen/Gemini dead code removed |
| 0.5.9 | 2026-03-20 | Worktrees moved inside repo under `.xtrm/worktrees/`; `.gitignore` entry added |
| 0.5.8 | 2026-03-20 | session-flow rewrite: removed xtrm-finish/session-state dead code; claim sync + stop gate + `xt end` reminder |
| 0.5.7 | 2026-03-20 | Dead hooks removed (`main-guard.mjs`, `guard-rules.mjs`, `agent_context.py`); dead CLI removed (`finish.ts`, `session-state.ts`) |
| 0.5.6 | 2026-03-20 | `xt` CLI commands (`xt claude`, `xt pi`, `xt worktree list/clean/remove`, `xt end`); plugin-only delivery for Claude; deprecated `xtrm finish` and `.xtrm-session-state.json` |

See [CHANGELOG.md](CHANGELOG.md) for full history.

---

## License

MIT License
