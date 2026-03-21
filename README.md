# XTRM-Tools

> **Dual-runtime workflow system** — Claude Code plugin + Pi extension suite for workflow enforcement, code quality gates, issue tracking, and development automation.

**Version 0.5.24** | [Complete Guide](XTRM-GUIDE.md) | [Changelog](CHANGELOG.md)

---

## Quick Start

```bash
# Install globally (one-time)
npm install -g github:Jaggerxtrm/xtrm-tools@latest

# Install the plugin
xtrm install

# Verify
claude plugin list
# → xtrm-tools@xtrm-tools  Version: 0.5.10  Status: ✔ enabled
```

**One-line run:**
```bash
npx -y github:Jaggerxtrm/xtrm-tools install
```

---

## What's Included

### Core Enforcement

| Component | Runtime | Purpose |
|-----------|---------|---------|
| **Beads Gates** | both | Issue tracking — edit/commit/stop gates, memory prompts |
| **Session Flow** | both | Claim sync, stop gate, `xt end` reminder in worktrees |
| **Quality Gates** | both | Auto linting (ESLint, tsc, ruff, mypy) on file edits |
| **GitNexus** | Claude | Knowledge graph context for code exploration |
| **Service Skills** | Pi | Territory-based Docker service skill activation |

### Skills

| Skill | Type | Purpose |
|-------|------|---------|
| `using-xtrm` | Global | Session operating manual |
| `documenting` | Global | SSOT documentation with drift detection |
| `delegating` | Global | Task delegation to cost-optimized agents |
| `orchestrating-agents` | Global | Multi-model collaboration |
| `using-quality-gates` | Global | Quality gate configuration and usage guide |
| `using-service-skills` | Global | Territory-based service skill activation |
| `creating-service-skills` | Global | Scaffold new service skills via Serena LSP deep dive |
| `scoping-service-skills` | Global | Define territory globs for service skill routing |
| `updating-service-skills` | Global | Drift detection and sync for service skill definitions |

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
| `session-flow.json` | both | Claim sync, stop gate, `xt end` reminder |
| `beads.json` | both | Issue tracking gates |
| `quality-gates.json` | both | Linting/typechecking |
| `quality-gates-env.json` | both | Warns if tsc/ruff/eslint missing at session start |
| `using-xtrm.json` | claude | Injects using-xtrm session manual at SessionStart |
| `gitnexus.json` | claude | Knowledge graph enrichment |
| `worktree-boundary.json` | claude | Blocks edits outside worktree when in `.xtrm/worktrees` |
| `service-skills.json` | pi | Territory-based skill activation |

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
| `install` | Install plugin + beads + gitnexus (interactive target selection) |
| `init` | Initialize project data (bd, gitnexus, service-registry) |
| `status` | Read-only diff view |
| `clean` | Remove orphaned hooks |
| `end` | Close worktree session: rebase, push, PR, cleanup |
| `worktree list` | List all active `xt/*` worktrees |
| `worktree clean` | Remove worktrees whose branch has been merged |
| `claude` | Launch Claude Code in a sandboxed worktree |
| `pi` | Launch Pi in a sandboxed worktree |
| `docs show` | Display frontmatter for README, CHANGELOG, docs/*.md |
| `debug` | Watch xtrm hook and bd lifecycle events in real time |

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
| `UserPromptSubmit` | After user submits prompt |
| `PreToolUse` | Before tool invocation |
| `PostToolUse` | After tool completes |
| `Stop` | Session ends |
| `PreCompact` | Before compaction |

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

Official Claude plugins are installed during `xtrm install`:
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
| 0.5.24 | 2026-03-21 | Hash-based docs drift detection; CLI docs cleanup; `docs` and `debug` commands documented |
| 0.5.23 | 2026-03-21 | `xtrm debug` command for real-time event monitoring |
| 0.5.20 | 2026-03-21 | `xtrm docs show` command; worktree-boundary hook; statusline injection |
| 0.5.10 | 2026-03-21 | Install cleanup: removes stale `~/.claude/hooks/` + `~/.claude/skills/`; Qwen/Gemini dead code removed |
| 0.5.9 | 2026-03-20 | Worktrees moved inside repo under `.xtrm/worktrees/` |
| 0.5.8 | 2026-03-20 | session-flow rewrite: claim sync, stop gate, `xt end` reminder |
| 0.5.7 | 2026-03-20 | Dead hooks removed; dead CLI removed (`finish.ts`, `session-state.ts`) |
| 0.5.6 | 2026-03-20 | `xt` CLI commands; plugin-only delivery for Claude; deprecated `xtrm finish` |

---

## License

MIT License
