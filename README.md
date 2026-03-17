# XTRM-Tools

**Claude Code tools installer** — skills, hooks, MCP servers, and project-specific extensions.

> **ARCHITECTURAL DECISION (v2.0.0+):** xtrm-tools supports **Claude Code exclusively**. Hook translation for Gemini CLI and Qwen CLI was removed.

> **MIGRATION NOTICE (v2.1.20+):** Core logic has moved to **Pi Extensions**. See the [Pi Extensions Migration Guide](docs/pi-extensions-migration.md).

This repository contains production-ready extensions to enhance Claude's capabilities with prompt improvement, task delegation, development workflow automation, and quality gates. The `xtrm` CLI provides a robust, modular "Plug & Play" installation engine for project-specific tools.

## Quick Start

```bash
# Install globally (one-time)
git clone https://github.com/Jaggerxtrm/xtrm-tools.git
cd xtrm-tools/cli
npm install && npm run build
npm link

# Initialize a project and register gitnexus MCP
xtrm project init
```

## Table of Contents

- [Project Skills & Hooks](#project-skills--hooks)
- [Global Skills](#global-skills)
- [Installation](#installation)
- [CLI User Guide](#cli-user-guide)
- [Configuration](#configuration)
- [Version History](#version-history)
- [License](#license)

---

## Project Skills & Hooks

Project skills are modular, plug-and-play tool packages extending Claude's capabilities for specific workflows. They install into your project's `.claude/` directory and include specific hooks enforcing local workflow rules and quality gates.

### using-xtrm (Session Operating Manual)
**The foundational operating manual for an xtrm-equipped session.**
- **Invocation**: Activates automatically at session start via hook.
- **Purpose**: Orients the agent on how to work within the xtrm stack: applying prompt improvement, using the beads issue-tracking gate, enforcing PR workflows, and combining the full toolset (gitnexus, Serena, quality gates, delegation).
- **Core Workflow**: Provides the authoritative guide on feature-branch usage, requiring PRs for merges (with `--squash`), and stopping dangerous git commands on protected branches.

### Quality Gates (`using-quality-gates`)
Code quality enforcement via the **Pi Extension** (`quality-gates.ts`), which fires on every mutating file tool result.
- **TypeScript/JS**: delegates to project-local `.claude/hooks/quality-check.cjs` (ESLint + tsc)
- **Python**: delegates to project-local `.claude/hooks/quality-check.py` (ruff + mypy)
- Exit code 2 = blocking — Claude must fix before continuing.
- No classic hook entry required; runs automatically when the Pi extension is loaded.

> **Note:** `tdd-guard` is available as an installable project skill (`xtrm install project tdd-guard`) but is not enforced by default.

### Service Skills Set (Trinity)
Task intake and service routing for Docker service projects.
- **Invocation**: `/scope "task description"` or automatic via SessionStart hook.
- **Purpose**: Gives Claude persistent, service-specific expertise without re-explaining architecture. Emits structured scope plans and detects codebase drift via PostToolUse hooks.

### Core Project Hooks

**Main Guard (`main-guard.mjs`)**
- **Trigger**: PreToolUse (Write|Edit|MultiEdit|Serena edit tools|Bash)
- **Purpose**: Enforces PR-only merge workflow with full git protection. Blocks direct commits and dangerous `git checkout` / `git push` commands on protected branches (`main/master`).
- **Post-Push (`main-guard-post-push.mjs`)**: After pushing a feature branch, reminds to use `gh pr merge --squash` and sync local via `git reset --hard origin/main`.

**GitNexus Graph Context (`gitnexus-hook.cjs`)**
- **Trigger**: PostToolUse (with Serena support and dedup cache)
- **Purpose**: Enriches tool output with knowledge graph context via `gitnexus augment`.
- *Note: `gitnexus-impact-reminder` was removed as impact analysis enforcement is now native.*

**Beads Issue Tracking Gates**
- **Trigger**: PreToolUse (edit/commit), PostToolUse (claim sync), Stop (memory + stop gate), PreCompact, SessionStart
- **Purpose**: Ensures all work is tracked to a `bd` issue. Blocks file edits without an active claim.
- **Claim sync (`beads-claim-sync.mjs`)**: PostToolUse hook that syncs claim state after `bd update --claim` shell commands.
- **Compaction**: `PreCompact` and `SessionStart` hooks preserve `in_progress` beads state across `/compact` events. Hook blocking messages are quieted and compacted to save tokens.

---

## Global Skills

Global skills are reusable workflows installed to the user-level Claude environment (not tied to one repo). 

### documenting
Maintains Single Source of Truth (SSOT) documentation system with drift detection.
- **Invocation**: `/document [task]`
- **Purpose**: Creates, updates, and validates SSOT documentation. Auto-generates INDEX blocks for rapid navigation. A Stop hook fires at session end to detect stale memories based on the `tracks:` frontmatter field.

### delegating
Proactively delegates tasks to cost-optimized agents before working in main session.
- **Invocation**: `/delegate [task]` or `/delegating [task]`
- **Purpose**: Routes simple deterministic tasks (tests, typos, formatting, docs) to GLM/Gemini/Qwen, and complex reasoning tasks to multi-agent orchestration. Interactive 2-step menu helps select the backend. Avoids main session token usage.

### orchestrating-agents
Orchestrates task handoff and "handshaking" between Gemini and Qwen CLI agents.
- **Invocation**: `/orchestrate [workflow-type] [task]`
- **Purpose**: Facilitates multi-model collaboration, adversarial reviews, and deep cross-validation of complex logic. Workflows include collaborative design, adversarial security review, troubleshooting, and single handshakes.

---

## Installation

### 🚀 Quick One-Time Run

```bash
npx -y github:Jaggerxtrm/xtrm-tools install all
```

### 🛠️ Global Installation (Recommended)

```bash
npm install -g github:Jaggerxtrm/xtrm-tools@latest

xtrm install all            # Install to all global targets
xtrm project init           # Setup current project (runs gitnexus analyze + bd init)
xtrm install project all    # Install all project-specific skills
```

---

## CLI User Guide

```
xtrm <command> [options]
```

| Command | Description |
|---|---|
| `install all` | Non-interactive global install to all detected targets (installs `gitnexus` globally) |
| `install basic` | Interactive global installation |
| `install project <name>` | Install specific project skills (e.g., `tdd-guard`, `service-skills-set`) |
| `project init` | Onboarding: runs `gitnexus analyze`, registers MCP, and runs `bd init` |
| `status` | Read-only diff view showing what would change (with inline sync prompt) |
| `clean` | Removes orphaned hooks, stale wrappers, and dead skills from your system |
| `reset` | Clear saved CLI preferences |

---

## Configuration

### MCP Servers

Unified CLI sync configures core servers securely.

**Core Servers**:
- **serena**: Code analysis (requires `uvx`)
- **context7**: Documentation lookup (requires `CONTEXT7_API_KEY`)
- **github-grep**: Code search
- **deepwiki**: Technical documentation
- **gitnexus**: Knowledge graph code intelligence (registered during `xtrm project init`)

Configured via `~/.config/xtrm-tools/.env`. Run `xtrm install basic` to sync interactively.

---

## Version History

| Version | Date | Highlights |
|---|---|---|
| 2.2.0 | 2026-03-17 | Pi extension parity: quality-gates, beads, service-skills, main-guard; `beads-claim-sync.mjs`; `xtrm clean` canonical wiring validation |
| 2.1.20 | 2026-03-16 | `xtrm clean` command, compact hook messages, `pruneStaleWrappers` fixes |
| 2.1.18 | 2026-03-16 | `PreCompact` / `SessionStart` hooks to preserve `in_progress` beads state |
| 2.1.16 | 2026-03-15 | Removed deprecated skill-suggestion, gitnexus-impact-reminder hooks |
| 2.1.14 | 2026-03-15 | Rewrote gitnexus-hook as PostToolUse with Serena; added `using-xtrm` skill |
| 2.1.9 | 2026-03-15 | `main-guard` enforced PR-only workflow, `--squash` requirement, npm publish |

See [CHANGELOG.md](CHANGELOG.md) for full history.

## License

MIT License - See LICENSE file for details.
