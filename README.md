# XTRM-Tools

**Claude Code plugin** — workflow enforcement hooks, skills, MCP servers, and project-specific extensions.

> **v2.3.0+:** xtrm-tools is now a **Claude Code plugin**. `xtrm install` registers the plugin directly — no hook or settings.json wiring needed. Skills are auto-discovered, MCP servers come from `.mcp.json`, hooks load from `hooks/hooks.json` via `${CLAUDE_PLUGIN_ROOT}`.

This repository contains production-ready extensions to enhance Claude's capabilities with prompt improvement, task delegation, development workflow automation, and quality gates. The `xtrm` CLI installs the plugin for Claude Code and syncs skills to `~/.agents/skills` for other runtimes.

## Quick Start

```bash
# Install globally (one-time)
git clone https://github.com/Jaggerxtrm/xtrm-tools.git
cd xtrm-tools/cli
npm install && npm run build
npm link

# Install the plugin + beads + gitnexus
xtrm install all

# Verify the plugin loaded
claude plugin list
# → xtrm-tools@xtrm-tools  Version: 2.3.0  Status: ✔ enabled

# Initialize a project (runs gitnexus analyze + bd init)
xtrm project init
```

## Table of Contents

- [Plugin Structure](#plugin-structure)
- [Project Skills & Hooks](#project-skills--hooks)
- [Global Skills](#global-skills)
- [Installation](#installation)
- [CLI User Guide](#cli-user-guide)
- [Configuration](#configuration)
- [Version History](#version-history)
- [License](#license)

---

## Plugin Structure

xtrm-tools ships as a Claude Code plugin located at `plugins/xtrm-tools/`. Claude Code auto-discovers all components:

```
plugins/xtrm-tools/
├── .claude-plugin/plugin.json   # Manifest (name: xtrm-tools, version: 2.3.0)
├── hooks/ → ../../hooks         # Symlink — all hook scripts + hooks.json
├── skills/ → ../../skills       # Symlink — all skills (auto-discovered)
└── .mcp.json → ../../.mcp.json  # Symlink — MCP server definitions
```

The repo root `.claude-plugin/marketplace.json` registers this as a local marketplace, allowing `xtrm install` to call `claude plugin marketplace add` + `claude plugin install` without any manual setup.

**To install manually:**
```bash
claude plugin marketplace add /path/to/xtrm-tools --scope user
claude plugin install xtrm-tools@xtrm-tools --scope user
```

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

### Core Hooks

**Main Guard (`main-guard.mjs`)**
- **Trigger**: PreToolUse (Write|Edit|MultiEdit|Serena edit tools|Bash)
- **Purpose**: Enforces PR-only merge workflow with full git protection. Blocks direct commits and dangerous `git checkout` / `git push` commands on protected branches (`main/master`).
- **Post-Push (`main-guard-post-push.mjs`)**: After pushing a feature branch, reminds to use `gh pr merge --squash` and sync local via `git reset --hard origin/main`.

**GitNexus Graph Context (`gitnexus-hook.cjs`)**
- **Trigger**: PostToolUse (with Serena support and dedup cache)
- **Purpose**: Enriches tool output with knowledge graph context via `gitnexus augment`.

**Beads Issue Tracking Gates**
- **Trigger**: PreToolUse (edit/commit), PostToolUse (claim sync), Stop (memory + stop gate), PreCompact, SessionStart
- **Purpose**: Ensures all work is tracked to a `bd` issue. Blocks file edits without an active claim.
- **Claim sync (`beads-claim-sync.mjs`)**: PostToolUse hook that syncs claim state after `bd update --claim` shell commands.
- **Compaction**: `PreCompact` and `SessionStart` hooks preserve `in_progress` beads state across `/compact` events.

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

xtrm install all            # Registers xtrm-tools plugin + installs beads/gitnexus
xtrm project init           # Setup current project (runs gitnexus analyze + bd init)
xtrm install project all    # Install all project-specific skills
```

### Verify

```bash
claude plugin list
# → xtrm-tools@xtrm-tools  Version: 2.3.0  Status: ✔ enabled

claude plugin validate /path/to/xtrm-tools/plugins/xtrm-tools
# → ✔ Validation passed
```

---

## CLI User Guide

```
xtrm <command> [options]
```

| Command | Description |
|---|---|
| `install all` | Registers xtrm-tools plugin for Claude Code, installs beads + gitnexus globally |
| `install basic` | Interactive global installation |
| `install project <name>` | Install specific project skills (e.g., `tdd-guard`, `service-skills-set`) |
| `project init` | Onboarding: runs `gitnexus analyze`, registers MCP, and runs `bd init` |
| `status` | Read-only diff view showing what would change (with inline sync prompt) |
| `clean` | Removes orphaned hooks, stale wrappers, and dead skills from your system |
| `reset` | Clear saved CLI preferences |

---

## Configuration

### MCP Servers

Defined in `.mcp.json` and loaded automatically by the plugin. No CLI sync needed for Claude Code.

**Core Servers**:
- **serena**: Code analysis (requires `uvx`)
- **context7**: Documentation lookup (requires `CONTEXT7_API_KEY`)
- **github-grep**: Code search
- **deepwiki**: Technical documentation
- **gitnexus**: Knowledge graph code intelligence (registered during `xtrm project init`)

---

## Version History

| Version | Date | Highlights |
|---|---|---|
| 2.3.0 | 2026-03-17 | Claude Code plugin structure: `plugins/xtrm-tools/`, `hooks/hooks.json`, `.mcp.json`; `xtrm install` registers plugin via `claude plugin` CLI; settings.json hook wiring retired for Claude path |
| 2.2.0 | 2026-03-17 | Pi extension parity: quality-gates, beads, service-skills, main-guard; `beads-claim-sync.mjs`; `xtrm clean` canonical wiring validation |
| 2.1.20 | 2026-03-16 | `xtrm clean` command, compact hook messages, `pruneStaleWrappers` fixes |
| 2.1.18 | 2026-03-16 | `PreCompact` / `SessionStart` hooks to preserve `in_progress` beads state |
| 2.1.16 | 2026-03-15 | Removed deprecated skill-suggestion, gitnexus-impact-reminder hooks |
| 2.1.14 | 2026-03-15 | Rewrote gitnexus-hook as PostToolUse with Serena; added `using-xtrm` skill |

See [CHANGELOG.md](CHANGELOG.md) for full history.

## License

MIT License - See LICENSE file for details.
