---
name: using-xtrm
description: >
  Operating manual for an xtrm-equipped Claude Code session. Activates automatically at
  session start to orient the agent on how to work within the xtrm stack: session start
  checklist, beads gate workflow, memory gate protocol, which hooks enforce which rules,
  and how to compose the full toolset (GitNexus, Serena, quality gates, delegation).
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
| **Project Data (`xtrm init`)** | Per-repo bootstrap: `.beads/` issue DB, GitNexus index, AGENTS.md/CLAUDE.md headers |
| **MCP Servers** | Semantic tools: Serena (code), gitnexus (graph), context7 (docs), deepwiki |
| **CLI** | `xtrm install / status / clean / help` + `xt claude / pi / worktree / end` |
| **beads (bd)** | Git-backed issue tracker with session gate enforcement and persistent memory |

---

## Session Start Checklist

Run these in order at the beginning of every session:

```bash
bd prime                    # Load workflow context + active claims (auto-called by hook)
bd memories <keyword>       # Retrieve memories relevant to today's task
bd recall <key>             # Retrieve a specific memory by key if needed
bd ready                    # Find available unblocked work
bd update <id> --claim      # Claim before any file edit
```

> After `/compact`, run `bd prime` manually — the hook only fires at true session start.

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

## Beads — Session Protocol

This environment enforces a **beads session gate** plus **session-flow lifecycle gate**.
You cannot edit files without a claim, and you cannot stop with an unclosed claim.

### Standard workflow

```bash
# 1. Find and claim work
bd ready                         # find unblocked issues
bd show <id>                     # review details
bd update <id> --claim           # claim — required before any file edit

# 2. Work on the claimed branch/worktree

# 3. Close when done
bd close <id> --reason="..."     # closes issue + auto-commits

# 4. Push and merge
git push -u origin feature/<name>
gh pr create --fill && gh pr merge --squash
git checkout main && git pull --ff-only
git branch -d <branch> && git push origin --delete <branch>
```

### bd quick reference

```bash
# Discovery
bd ready                                       # unblocked open issues
bd show <id>                                   # full detail + deps
bd list --status=in_progress                   # your active claims
bd query "status=in_progress AND assignee=me"  # complex filter
bd search <text>                               # full-text search

# Creating
bd create --title="..." --description="..." --type=task --priority=2
# --deps "discovered-from:<id>"  link follow-ups to their source
# priority: 0=critical  1=high  2=medium  3=low  4=backlog
# types: task | bug | feature | epic | chore | decision

# Updating
bd update <id> --notes "..."    # append notes inline
bd update                       # update last-touched issue (no ID needed)

# Closing
bd close <id> --reason="..."    # close + auto-commit
bd close <id1> <id2> <id3>     # batch close

# Dependencies
bd dep add <issue> <depends-on> # issue depends on depends-on
bd dep <blocker> --blocks <id>  # shorthand
bd dep relate <a> <b>           # non-blocking "relates to" link
bd blocked                      # show all blocked issues

# Memory
bd remember "<insight>"         # persist across sessions
bd memories <keyword>           # search memories
bd recall <key>                 # retrieve by key
bd forget <key>                 # remove a memory

# Health
bd stats                        # open/closed/blocked counts
bd preflight --check            # pre-PR readiness
bd doctor                       # diagnose installation issues
```

**Key rules:**
- Always work on a **feature branch**, never directly on `main`/`master`
- `bd close` auto-commits via `git commit -am` — do not double-commit after closing
- Never chain `bd kv clear` with `git commit` — run them as separate commands

---

## Beads — Memory Gate Protocol

The **memory gate** fires automatically at session Stop if an issue was closed this session.
When blocked on Stop with the memory gate message:

```bash
# For each closed issue — did this session produce insights worth keeping?
bd remember "<insight>"              # YES: persist it
# or note "nothing to persist"       # NO: explicitly decide

# Acknowledge when evaluation is complete
touch .beads/.memory-gate-done
```

At the **start** of the next session, retrieve those memories:
```bash
bd memories <keyword>    # search by topic
bd recall <key>          # retrieve by exact key
```

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

## Code Intelligence — GitNexus Workflow

Before editing any function, class, or method — always run impact analysis.

```bash
# 1. Before editing — blast radius
gitnexus_impact({target: "symbolName", direction: "upstream"})

# 2. Full context on a symbol (callers, callees, flows)
gitnexus_context({name: "symbolName"})

# 3. Find code by concept (instead of grepping)
gitnexus_query({query: "concept"})

# 4. Before committing — verify scope
gitnexus_detect_changes({scope: "staged"})
```

**Risk levels**: d=1 = WILL BREAK (must fix), d=2 = likely affected (should test), d=3 = transitive (test if critical).

Stop and warn the user if impact returns HIGH or CRITICAL before proceeding.

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

> **Global-first**: quality-gates hooks are global; no per-project install needed.
> Run `xtrm init` once per repo to bootstrap project data, then ensure the repo has
> `eslint.config.*` (TS) or `pyproject.toml` / `ruff.toml` (Python) so checks can run.

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

> Quality-gates and service-skills workflows are globally available after `xtrm install`.
> Use `xtrm init` to provision per-project data (beads + GitNexus index).

---

## Hook Enforcement Summary

These hooks run automatically — you cannot disable them mid-session:

| Hook | Trigger | Effect |
|---|---|---|
| `beads-edit-gate.mjs` | PreToolUse (Edit/Write/Serena) | Blocks edits without active claim |
| `beads-commit-gate.mjs` | PreToolUse (Bash: git commit) | Blocks commit while claim is open |
| `beads-claim-sync.mjs` | PostToolUse (Bash: bd close/claim) | Auto-commits on `bd close`; notifies on `bd update --claim` |
| `beads-stop-gate.mjs` | Stop | Blocks stop with unclosed in_progress claim |
| `beads-memory-gate.mjs` | Stop | Prompts for persistent insights after issue closure |
| `beads-compact-save/restore.mjs` | PreCompact / SessionStart | Preserves claim + session state across `/compact` |
| `serena-workflow-reminder.py` | SessionStart | Reminds semantic editing workflow |
| `branch-state.mjs` | UserPromptSubmit | Injects current branch + claim state into every prompt |
| `quality-check.(cjs\|py)` | PostToolUse (Edit/Write) | Runs lint + type checks automatically |
| `gitnexus/gitnexus-hook.cjs` | PostToolUse (Bash/Serena tools) | Enriches context with knowledge graph data |

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
4. `bd close <id> --reason="..."` — issue closed
5. `git push` and PR merged (or `xt end` from within worktree for full lifecycle)
