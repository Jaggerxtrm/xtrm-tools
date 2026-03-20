---
name: using-xtrm
description: >
  Operating manual for an xtrm-equipped Claude Code session. Activates automatically at
  session start to orient the agent on how to work within the xtrm stack: when to apply
  prompt improvement, how the beads issue-tracking gate works, which hooks enforce workflows,
  and how to compose the full toolset (gitnexus, Serena, quality gates, delegation).
  Use this skill whenever a new session begins in an xtrm-tools-installed environment, or
  when the user asks how to work with the xtrm stack, what tools are available, or how any
  xtrm workflow operates.
priority: high
---

# Using xtrm — Session Operating Manual

You are in an **xtrm-equipped Claude Code environment**. This skill orients you on *how to work*
within this stack. Read it at session start and refer back when uncertain about a workflow.

---

## Stack at a Glance

| Layer | What it provides |
|---|---|
| **Skills** | Domain expertise loaded on demand |
| **Hooks** | Automated lifecycle enforcement (gates, suggestions, reminders) |
| **Project Data (`xtrm init`)** | Per-repo bootstrap data (`.beads/`, `service-registry.json`, GitNexus index) |
| **MCP Servers** | Semantic tools: Serena (code), gitnexus (graph), context7 (docs), deepwiki |
| **CLI** | `xtrm install / status / reset / help` + `xt claude / pi / worktree / end` — sync and closure tooling |
| **beads (bd)** | Git-backed issue tracker with session gate enforcement |

---

## Core Principle: Prompt First, Then Work

Before executing any non-trivial task, improve the prompt mentally using XML structure.
Apply this silently — the user sees your improved execution, not the meta-work.

### Prompt Classification

Scan the user's message for task type:

| Type | Keywords | Enhancement |
|---|---|---|
| **ANALYSIS** | analyze, investigate, research, explain, why | Add `<thinking>` block, structure `<outputs>` |
| **DEV** | implement, create, build, add, fix, feature | Add 1-2 `<example>` blocks, define `<constraints>` |
| **REFACTOR** | refactor, improve, optimize, clean, simplify | Add `<constraints>` (preserve behavior, tests pass) + `<current_state>` |

### XML Prompt Structure

```xml
<task_name>
  <description>What needs to be done and why</description>
  <parameters>Relevant context: files, symbols, constraints</parameters>
  <instructions>
    Step-by-step approach
  </instructions>
  <!-- ANALYSIS tasks: -->
  <thinking>Work through hypotheses before concluding</thinking>
  <outputs>Expected result format</outputs>
  <!-- DEV tasks: -->
  <example>Concrete pattern to follow</example>
  <!-- REFACTOR tasks: -->
  <constraints>Must not break X, tests must pass, preserve API surface</constraints>
</task_name>
```

When a prompt is vague (under 8 words, no specifics), ask one clarifying question before
proceeding. Don't ask about things you can reasonably infer.

---

## Beads + Session Flow — Session Protocol

This environment enforces a **beads session gate** plus **session-flow lifecycle gate**.
You cannot edit files without a claim, and you cannot safely end a closure-in-progress session.

```bash
# 1. Claim before editing
bd list --status=open
bd update <id> --claim
# hook auto-sets session claim

# 2. Work in the claimed branch/worktree

# 3. Close issue when implementation is done
bd close <id>

# 4. Session close protocol (single command, run from within the worktree)
xt end
# blocking: commit/push/pr-create/auto-merge poll/worktree cleanup
```

**Key rules:**
- One active claim per session
- Always work on a **feature branch**, never directly on `main`/`master`
- `beads-stop-gate.mjs` blocks stop when active in_progress claim exists
- If blocked on stop: close the claim then re-run `xt end`

---

## Code Editing — Serena LSP Workflow

Always use semantic tools. Never read entire large files or use generic Edit unless forced.

```
get_symbols_overview(file)           → map the file structure first
find_symbol(name, include_body=true) → read only what you need
find_referencing_symbols(name)       → check callers before changing signatures
replace_symbol_body(name, body)      → atomic symbol-level edit
insert_after_symbol / insert_before_symbol → add new code precisely
```

**Activate project first** (required once per session):
```
mcp__serena__activate_project("<project-name>")
```

**Fallback**: Use `Edit` only for non-code files or when a symbol can't be located.

---

## Code Intelligence — gitnexus Workflow

Before editing any function, class, or method — always run impact analysis.

```bash
# 1. Before editing
npx gitnexus impact <symbolName> --direction upstream

# 2. Understand a symbol fully
gitnexus_context({name: "symbolName"})

# 3. Find code by concept (instead of grepping)
gitnexus_query({query: "concept"})

# 4. Before committing — verify scope
gitnexus_detect_changes({scope: "staged"})
```

**Risk levels**: d=1 = WILL BREAK (must fix), d=2 = likely affected (should test), d=3 = transitive (test if critical).

If index is stale: `npx gitnexus analyze` before using MCP tools.

> **Note**: gitnexus MCP server and CLI share an exclusive DB lock — they cannot run concurrently.
> Use CLI (`npx gitnexus ...`) when MCP is active, or stop MCP first.

---

## Quality Gates — Automatic on Every Edit

After each file edit, quality-gates hooks run automatically:
- **TypeScript**: ESLint + tsc type check
- **Python**: Ruff lint + mypy type check

You do not invoke these manually — they fire via PostToolUse hooks. If a gate fails, fix the
lint/type error before continuing. Do not suppress errors with `// eslint-disable` or `# type: ignore`
unless there is a genuine reason.

> **Global-first behavior**: quality-gates hooks are global; no per-project install is needed.
> Run `xtrm init` once per repository to bootstrap project data, then ensure the repo has
> `eslint.config.*` (TS) or `pyproject.toml` / `ruff.toml` (Python) configured so checks can run.

---

## Skill Routing — When to Use What

| Situation | Use |
|---|---|
| Short/vague user prompt | Apply XML structure silently (this skill) or `/prompt-improving` |
| Simple task (tests, docs, typo fix) | `/delegating` → cost-optimized agent |
| Complex task needing second opinion | `/orchestrate adversarial "task"` |
| Reading/editing code | `using-serena-lsp` (Serena MCP) |
| Understanding code architecture | `gitnexus-exploring` |
| Tracing a bug | `gitnexus-debugging` |
| Changing a function | `gitnexus-impact-analysis` first, then Serena edit |
| Safe rename/refactor | `gitnexus-refactoring` |
| Docker service project | `using-service-skills` → activate expert persona |
| Writing new feature | Write tests alongside, quality gates auto-run after |
| Maintaining docs | `/documenting` (Serena SSOT drift detection) |
| Building/improving a skill | `skill-creator` |

---

## Available Skills (Full Catalog)

**Workflow:**
`prompt-improving`, `delegating`, `orchestrating-agents`, `using-serena-lsp`, `documenting`,
`using-xtrm` (this skill), `skill-creator`, `find-skills`

**Code Intelligence:**
`gitnexus-exploring`, `gitnexus-debugging`, `gitnexus-impact-analysis`, `gitnexus-refactoring`

**Domain Experts:**
`senior-backend`, `senior-devops`, `senior-security`, `senior-data-scientist`,
`docker-expert`, `python-testing`, `clean-code`

**Integrations:**
`obsidian-cli`, `hook-development`, `claude-api`

**Global-first note:**
`quality-gates` and `service-skills` workflows are globally available after `xtrm install all`.
Use `xtrm init` to provision per-project data (beads + service-registry + GitNexus index).

---

## Hook Enforcement Summary

These hooks run automatically — you cannot disable them mid-session:

| Hook | Trigger | Effect |
|---|---|---|
| `beads-edit-gate.mjs` | PreToolUse (Edit/Write/Serena) | Blocks edits without active claim |
| `beads-commit-gate.mjs` | PreToolUse (Bash: git commit) | Blocks commit with unclosed claim |
| `beads-claim-sync.mjs` | PostToolUse (Bash claim command) | Runs auto-commit on bd close (feature branches only) |
| `beads-stop-gate.mjs` | Stop | Blocks stop when active in_progress claim exists |
| `beads-memory-gate.mjs` | Stop | Prompts for persistent insights after closure |
| `beads-compact-save/restore.mjs` | PreCompact / SessionStart | Preserves claim + session state across compact |
| `serena-workflow-reminder.py` | SessionStart | Reminds semantic editing workflow |
| `quality-check.(cjs|py)` | PostToolUse (Edit/Write) | Runs lint + type checks automatically |

---

## MCP Servers

| Server | Use for | Setup |
|---|---|---|
| `serena` | Semantic code reading/editing | Auto-detected; activate project per session |
| `gitnexus` | Knowledge graph, impact analysis | `npm install -g gitnexus` + `npx gitnexus analyze` per project |
| `context7` | Library documentation lookup | No setup needed (free stdio transport) |
| `deepwiki` | Technical docs for GitHub repos | No setup needed |
| `github-grep` | Code search across GitHub | No setup needed |

---

## Checklist Before Finishing Any Task

1. `gitnexus_detect_changes(...)` — confirms only expected files/flows changed
2. All d=1 dependents updated (if any signal from impact analysis)
3. Tests pass (targeted + relevant integration)
4. Beads issue closed: `bd close <id>`
5. Run `xt end` from within the worktree for blocking closure lifecycle
