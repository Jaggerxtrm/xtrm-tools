# XTRM-Tools

> **Claude Code plugin** — workflow enforcement, code quality gates, issue tracking, and development automation.

**Version 2.3.0** | [Complete Guide](XTRM-GUIDE.md) | [Changelog](CHANGELOG.md)

---

## Quick Start

```bash
# Install globally (one-time)
npm install -g github:Jaggerxtrm/xtrm-tools@latest

# Install the plugin
xtrm install all

# Verify
claude plugin list
# → xtrm-tools@xtrm-tools  Version: 2.3.0  Status: ✔ enabled
```

**One-line run:**
```bash
npx -y github:Jaggerxtrm/xtrm-tools install all
```

---

## What's Included

### Core Enforcement

| Component | Purpose |
|-----------|---------|
| **Main Guard** | PR-only workflow — blocks direct commits on `main`/`master` |
| **Beads Gates** | Issue tracking — edit/commit/stop gates, memory prompts |
| **Quality Gates** | Auto linting (ESLint, tsc, ruff, mypy) on file edits |
| **GitNexus** | Knowledge graph context for code exploration |

### Skills

| Skill | Type | Purpose |
|-------|------|---------|
| `using-xtrm` | Project | Session operating manual |
| `documenting` | Global | SSOT documentation with drift detection |
| `delegating` | Global | Task delegation to cost-optimized agents |
| `orchestrating-agents` | Global | Multi-model collaboration |

---

## Plugin Structure

```
plugins/xtrm-tools/
├── .claude-plugin/plugin.json   # Manifest
├── hooks → ../../hooks           # All hook scripts + hooks.json
├── skills → ../../skills         # Auto-discovered skills
└── .mcp.json → ../../.mcp.json   # MCP servers
```

All hook paths use `${CLAUDE_PLUGIN_ROOT}` — works from any installation location.

---

## Policy System

Policies are the **single source of truth** for all enforcement rules. Located in `policies/`, they compile to both Claude hooks and Pi extensions.

### Policy Files

| Policy | Runtime | Purpose |
|--------|---------|---------|
| `main-guard.json` | both | PR-only workflow |
| `beads.json` | both | Issue tracking gates |
| `quality-gates.json` | pi | Linting/typechecking |
| `branch-state.json` | claude | Branch context injection |
| `gitnexus.json` | claude | Knowledge graph enrichment |

### Compiler

```bash
node scripts/compile-policies.mjs           # Generate hooks.json
node scripts/compile-policies.mjs --check   # CI drift detection
```

---

## CLI Commands

```
xtrm <command> [options]
```

| Command | Description |
|---------|-------------|
| `install all` | Full plugin + beads + gitnexus |
| `install basic` | Plugin + skills (no beads) |
| `install project <name>` | Install project skill |
| `project init` | Initialize project (gitnexus + bd) |
| `status` | Read-only diff view |
| `clean` | Remove orphaned hooks |

### Flags

| Flag | Description |
|------|-------------|
| `--yes`, `-y` | Non-interactive mode |
| `--dry-run` | Preview only |
| `--prune` | Force-replace hooks |

---

## Hooks Reference

### Event Types

| Event | When |
|-------|------|
| `SessionStart` | Session begins |
| `PreToolUse` | Before tool invocation |
| `PostToolUse` | After tool completes |
| `Stop` | Session ends |
| `PreCompact` | Before compaction |

### Main Guard

- Blocks `git commit`/`push` on protected branches
- Blocks direct file edits on `main`/`master`
- Post-push reminder: `gh pr merge --squash`

### Beads Gates

| Hook | Behavior |
|------|----------|
| Edit Gate | Requires claimed issue to edit files |
| Commit Gate | Prompts to close issue before commit |
| Stop Gate | Blocks session end with unclosed issues |
| Memory Gate | Prompts to persist insights when closing |

---

## MCP Servers

Configured in `.mcp.json` (xtrm-managed only):

| Server | Purpose |
|--------|---------|
| `gitnexus` | Knowledge graph |
| `github-grep` | Code search |
| `deepwiki` | DeepWiki docs search |

Official Claude plugins are installed during `xtrm install all`:
- `serena@claude-plugins-official`
- `context7@claude-plugins-official`
- `github@claude-plugins-official`
- `ralph-loop@claude-plugins-official`

---

## Issue Tracking (Beads)

```bash
bd ready                    # Find unblocked work
bd update <id> --claim      # Claim an issue
bd close <id> --reason "Done"  # Close when done
```

---

## Documentation

- **[XTRM-GUIDE.md](XTRM-GUIDE.md)** — Complete reference guide
- **[CHANGELOG.md](CHANGELOG.md)** — Full version history
- **[ROADMAP.md](ROADMAP.md)** — Planned features

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 2.3.0 | 2026-03-17 | Plugin structure, policy compiler, Pi extension parity |
| 2.2.0 | 2026-03-17 | Pi extensions: quality-gates, beads, main-guard |
| 2.0.0 | 2026-03-12 | CLI rebrand, project skills engine |
| 1.7.0 | 2026-02-25 | GitNexus integration |

---

## License

MIT License
