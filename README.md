# XTRM-Tools

> **Dual-runtime workflow system** — Claude Code plugin + Pi extension suite for workflow enforcement, code quality gates, issue tracking, and development automation.

**Version 0.5.29** | [Complete Guide](XTRM-GUIDE.md) | [Changelog](CHANGELOG.md)

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

Core: `using-xtrm` (session manual), `documenting` (SSOT docs), `delegating` (task routing), `orchestrating-agents` (multi-model).

Workflow: `xt-end` (close session), `xt-merge` (PR queue), `planning` (issue boards), `test-planning` (test coverage).

Service: `using-quality-gates`, `using-service-skills`, `creating-service-skills`, `scoping-service-skills`, `updating-service-skills`.

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
| `pi` | Launch Pi in a sandboxed worktree; includes `install/setup/status/doctor/reload` runtime management |
| `docs show` | Display frontmatter for README, CHANGELOG, docs/*.md |
| `debug` | Watch xtrm hook and bd lifecycle events in real time |

### Pi Extension Loading

- `xt pi setup`, `xt pi install`, and `xt pi reload` share the same managed extension sync behavior.
- Extensions from `config/pi/extensions/<name>/` are synced to `~/.pi/agent/extensions/<name>/` and loaded by Pi auto-discovery.
- Managed extensions are not re-registered with `pi install -l` (prevents duplicate command/flag/shortcut registration conflicts).
- `custom-footer` now mirrors Claude statusline information density with a two-line parity layout (session metadata + claim/open issue row), while remaining compatible with `pi-dex` footer refresh behavior.

### Flags

| Flag | Description |
|------|-------------|
| `--yes`, `-y` | Non-interactive mode |
| `--dry-run` | Preview only |
| `--prune` | Force-replace hooks |

---

## Hooks Reference

Beads gates: **Edit** (claim required), **Commit** (close issue first), **Stop** (unclosed check), **Memory** (persist insights).

See [docs/hooks.md](docs/hooks.md) for full reference.

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
| 0.5.29 | 2026-03-22 | Statusline truecolor gradient; `--no-verify` autocommit; xt-merge skill |
| 0.5.24 | 2026-03-21 | Hash-based docs drift detection; CLI docs cleanup |
| 0.5.20 | 2026-03-21 | `xtrm docs show` command; worktree-boundary hook; statusline injection |
| 0.5.10 | 2026-03-21 | Install cleanup; Qwen/Gemini dead code removed |

See [CHANGELOG.md](CHANGELOG.md) for full history.

---

## License

MIT License
