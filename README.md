# XTRM-Tools

> **Dual-runtime workflow system** — Claude Code plugin + Pi extension suite for workflow enforcement, code quality gates, issue tracking, and development automation.

**Version 0.5.30** | [Complete Guide](XTRM-GUIDE.md) | [Changelog](CHANGELOG.md)

---

## Documentation

| Doc | Contents |
|-----|----------|
| [XTRM-GUIDE.md](XTRM-GUIDE.md) | Complete reference — architecture, concepts, full workflow |
| [docs/hooks.md](docs/hooks.md) | All hooks — event wiring, gate logic, order, authoring |
| [docs/policies.md](docs/policies.md) | Policy system — compiler, schema, Claude/Pi parity |
| [docs/skills.md](docs/skills.md) | Skills catalog — all skills, categories, how they load |
| [docs/pi-extensions.md](docs/pi-extensions.md) | Pi extensions — managed sync, authoring, parity notes |
| [docs/worktrees.md](docs/worktrees.md) | xt worktrees — `xt claude/pi`, `xt end`, isolation model |
| [docs/mcp-servers.md](docs/mcp-servers.md) | MCP servers — gitnexus, github-grep, deepwiki, official plugins |
| [docs/cli-architecture.md](docs/cli-architecture.md) | CLI internals — install flow, diff/sync engine, config merge |
| [docs/project-skills.md](docs/project-skills.md) | Project-scoped skills — install, layout, Pi/Claude symlinks |
| [docs/testing.md](docs/testing.md) | Live testing checklist — integration, gates, worktree flows |
| [CHANGELOG.md](CHANGELOG.md) | Full version history |

---

## Quick Start

```bash
# Install globally (one-time)
npm install -g github:Jaggerxtrm/xtrm-tools@latest

# Install the plugin
xtrm install

# Verify
claude plugin list
# → xtrm-tools@xtrm-tools  Version: 0.5.30  Status: enabled
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

Skills are organized into two categories: **xtrm workflow** skills built specifically for the xtrm stack, and **general-purpose** expert skills that work in any project.

#### xtrm Workflow Skills

These skills implement the xtrm-specific development workflow — session management, issue tracking, planning, quality, and documentation patterns.

| Skill | Purpose |
|-------|---------|
| `using-xtrm` | Session operating manual — when to use which tool |
| `using-quality-gates` | Quality gate workflow — TDD guard, lint/typecheck cycle |
| `using-serena-lsp` | Code exploration and surgical edits via Serena LSP |
| `using-tdd` | Test-driven development with 80%+ coverage enforcement |
| `using-service-skills` | Service catalog discovery and expert persona activation |
| `xt-end` | Autonomous session close — rebase, push, PR, cleanup |
| `xt-merge` | FIFO PR merge queue for xt worktree sessions |
| `planning` | Structured issue board from any spec, with phases and deps |
| `test-planning` | Test coverage planning alongside implementation work |
| `delegating` | Cost-optimized task delegation to background agents |
| `orchestrating-agents` | Multi-model orchestration (Gemini, Qwen handshake) |
| `documenting` | SSOT doc maintenance with drift detection |
| `sync-docs` | Doc audit and structural sync across a sprint |
| `skill-creator` | Create, improve, and evaluate skills |
| `find-skills` | Discover and install skills on demand |
| `creating-service-skills` | Generate operational service skill packages |
| `scoping-service-skills` | Task intake and service routing |
| `updating-service-skills` | Detect drift and sync expert persona docs |
| `prompt-improving` | Apply Claude XML best practices to prompts |

#### General-Purpose Expert Skills

Domain expert skills that can be used in any project, independent of the xtrm workflow.

| Skill | Purpose |
|-------|---------|
| `senior-backend` | NodeJS, Express, Go, Python, Postgres, REST/GraphQL |
| `senior-devops` | CI/CD, infrastructure as code, cloud platforms |
| `senior-security` | AppSec, pen testing, threat modeling, crypto |
| `senior-data-scientist` | Statistics, ML, A/B testing, causal inference |
| `docker-expert` | Multi-stage builds, Compose, container security |
| `python-testing` | pytest, TDD, fixtures, mocking, coverage |
| `hook-development` | PreToolUse/PostToolUse hook authoring |
| `clean-code` | Pragmatic coding standards, no over-engineering |
| `gitnexus-exploring` | Navigate unfamiliar code via knowledge graph |
| `gitnexus-impact-analysis` | Blast radius before making code changes |
| `gitnexus-debugging` | Trace bugs through call chains |
| `gitnexus-refactoring` | Plan safe refactors via dependency mapping |
| `obsidian-cli` | Interact with Obsidian vaults via CLI |

---

## Policy System

Policies in `policies/` are the single source of truth for all enforcement rules. They compile to both Claude hooks and Pi extensions.

| Policy | Runtime | Purpose |
|--------|---------|---------|
| `beads.json` | both | Issue tracking gates |
| `session-flow.json` | both | Claim sync, stop gate, `xt end` reminder |
| `quality-gates.json` | both | Linting/typechecking on file edits |
| `quality-gates-env.json` | both | Warns if tsc/ruff/eslint missing at session start |
| `gitnexus.json` | claude | Knowledge graph enrichment |
| `using-xtrm.json` | claude | Injects session manual at SessionStart |
| `worktree-boundary.json` | claude | Blocks edits outside active worktree |
| `service-skills.json` | pi | Territory-based skill activation |

```bash
node scripts/compile-policies.mjs           # Generate hooks.json
node scripts/compile-policies.mjs --check   # CI drift detection
```

See [docs/policies.md](docs/policies.md) for full schema and authoring reference.

---

## CLI Commands

```
xtrm <command> [options]
```

| Command | Description |
|---------|-------------|
| `install` | Install plugin + beads + gitnexus (interactive target selection) |
| `init` | Initialize project (bd, gitnexus, service-registry) |
| `status` | Read-only diff view |
| `clean` | Remove orphaned hooks |
| `end` | Close worktree session: rebase, push, PR, cleanup |
| `worktree list` | List all active `xt/*` worktrees |
| `worktree clean` | Remove merged worktrees |
| `claude` | Launch Claude Code in a sandboxed worktree |
| `pi` | Launch Pi in a sandboxed worktree |
| `docs show` | Display frontmatter for README, CHANGELOG, docs/*.md |
| `debug` | Watch hook and bd lifecycle events in real time |

**Flags:** `--yes / -y` (non-interactive), `--dry-run` (preview), `--prune` (force-replace hooks)

See [docs/cli-architecture.md](docs/cli-architecture.md) for internals.

---

## MCP Servers

| Server | Purpose |
|--------|---------|
| `gitnexus` | Knowledge graph |
| `github-grep` | Code search |
| `deepwiki` | Repository documentation |

Official Claude plugins installed by `xtrm install`: `serena`, `context7`, `github`, `ralph-loop`.

See [docs/mcp-servers.md](docs/mcp-servers.md) for configuration details.

---

## Issue Tracking (Beads)

```bash
bd ready                           # Find unblocked work
bd update <id> --claim             # Claim an issue
bd close <id> --reason "Done"      # Close when done
```

See [XTRM-GUIDE.md](XTRM-GUIDE.md) for the full `bd` command reference.

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 0.5.30 | 2026-03-22 | Fix statusline on fresh installs; `xt end --dry-run` |
| 0.5.29 | 2026-03-22 | Statusline truecolor gradient; `--no-verify` autocommit; xt-merge skill |
| 0.5.24 | 2026-03-21 | Hash-based docs drift detection; CLI docs cleanup |
| 0.5.20 | 2026-03-21 | `xtrm docs show`; worktree-boundary hook; statusline injection |

See [CHANGELOG.md](CHANGELOG.md) for full history.

---

MIT License
