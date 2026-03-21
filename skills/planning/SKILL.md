---
name: planning
description: >
  Structured planning skill for xtrm ecosystem projects. Creates a well-documented
  bd issue board from any task, feature, spec, or idea — with phases, dependencies,
  rich descriptions, and integrated test coverage via test-planning. MUST activate
  whenever the user wants to "plan", "design", "architect", "break down", "structure",
  "scope out", or "start" a feature or epic. Also activate when: the user describes
  a complex task without existing issues, pastes a spec or PRD to decompose, asks
  "how should I approach X" or "where do I start", mentions wanting to create
  implementation issues, or starts a new worktree session without a claimed issue.
  Activate even when the user says something like "I want to implement X" — if there's
  no existing issue board for X, planning comes first. Never skip planning when a
  task spans more than 2 files or 3 steps — that's when a structured board saves hours.
---

# Planning

Transform intent into a bd issue board: each issue self-contained, documented
enough for any agent or human to work independently.

## When This Fires

- `plan`, `design`, `architect`, `scope out`, `break down`, `how should I approach`
- Starting a new feature/epic from scratch
- Decomposing a spec, PRD, or long description into tasks
- Reviewing existing issues that lack documentation or structure
- Before `bd update --claim` — plan first, then claim

---

## Workflow

```
Phase 1  Clarify intent          → understand what, why, constraints
Phase 2  Explore codebase        → GitNexus + Serena, read-only
Phase 3  Structure the plan      → phases, deps, CoT reasoning
Phase 4  Create bd issues        → epic + tasks, rich descriptions
Phase 5  test-planning           → companion test issues per layer
Phase 6  Handoff                 → claim first issue, ready to build
```

---

## Phase 1 — Clarify Intent

Before touching any code, nail down:

<clarification_checklist>
  <item>What is being built? (feature, fix, refactor, migration)</item>
  <item>Why — what problem does it solve?</item>
  <item>Constraints (must not break X, must use pattern Y, deadline)</item>
  <item>Known unknowns — what needs investigation?</item>
  <item>Priority (P0 critical → P4 backlog)</item>
</clarification_checklist>

If the request is under 8 words or the scope is unclear, ask **one** clarifying question before exploring. Don't ask two.

---

## Phase 2 — Explore Codebase (Read-Only)

Use GitNexus and Serena to understand the landscape. No file edits.

```bash
# Find relevant execution flows
gitnexus_query({query: "<concept related to task>"})

# Understand a specific symbol
gitnexus_context({name: "<affected symbol>"})

# Check blast radius before planning changes
gitnexus_impact({target: "<symbol to change>", direction: "upstream"})

# Map a file without reading all of it
get_symbols_overview("path/to/relevant/file.ts")

# Read just the relevant function
find_symbol("SymbolName", include_body=true)
```

**Capture from exploration:**
- Which files/symbols will be affected
- What existing patterns to follow (naming, structure, error handling)
- Any d=1 dependents that require updates when you change a symbol
- Risk level: if CRITICAL or HIGH → warn user before proceeding

---

## Phase 3 — Structure the Plan

Think through the plan before writing any bd commands. Use structured CoT:

<thinking>
1. What are the distinct units of work? (group by: what can change together without breaking other things)
2. What phases make sense?
   - P0: Scaffold (types, interfaces, file structure) — others depend on this
   - P1: Core (pure logic, no I/O) — depends on scaffold
   - P2: Boundary/Integration (HTTP, DB, CLI wiring) — depends on core
   - P3: Tests — companion issues, see Phase 5
3. What are the dependencies? (what must be done before X can start?)
4. What can run in parallel? (independent tasks → no deps between them)
5. What are the risks? (complex areas, unclear spec, risky refactors)
</thinking>

<plan>
  <phase name="P0: Scaffold" issues="N">
    Setup that unblocks all other work
  </phase>
  <phase name="P1: Core" issues="N">
    Pure logic, data transforms, parsers
  </phase>
  <phase name="P2: Integration" issues="N">
    CLI wiring, API clients, I/O
  </phase>
</plan>

**Sizing guidance:**
- Prefer tasks completable in one session (1-4 hours of focused work)
- If a task has 5+ unrelated deliverables → split it
- If two tasks always ship together → merge them

---

## Phase 4 — Create bd Issues

### Determine epic scope

If the work fits under an **existing open epic** (`bd ready` to check), create tasks
under it with `--parent=<existing-epic-id>` and skip creating a new epic.

If this is genuinely new work with no parent, create the epic first.

### Create the epic (new work only)

```bash
bd create \
  --title="<Feature name — concise verb phrase>" \
  --description="$(cat <<'EOF'
## Overview

<2-3 sentences: what this is and why it exists>

## Goals

- Goal 1: measurable outcome
- Goal 2: measurable outcome

## Non-goals

- What we are explicitly NOT doing

## Success criteria

- [ ] Criteria 1 (observable, testable)
- [ ] Criteria 2

## Context / background

<Links to specs, related issues, existing code paths>
EOF
)" \
  --type=epic \
  --priority=<0-4>
```

### Create child task issues

```bash
bd create \
  --title="<Action phrase — what gets built>" \
  --description="$(cat <<'EOF'
## Context

<Why does this task exist? What does it enable? What comes before/after?>

## What to build

<Specific deliverables. Not "implement X" — "X that does Y when Z">

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Tests pass / lint clean

## Approach notes

<Relevant code paths (file:line), patterns to follow, discovered risks>
EOF
)" \
  --type=task \
  --priority=<same or +1 from epic> \
  --parent=<epic-id>
```

### Wire dependencies

```bash
# B depends on A (A blocks B)
bd dep add <B-id> <A-id>

# Non-blocking relationship
bd dep relate <issue-a> <issue-b>
```

### Issue description quality bar

Every task issue description must answer:
1. **Why** — why does this exist? (not obvious from the title)
2. **What** — specific deliverables (not vague)
3. **When done** — acceptance criteria as checkboxes
4. **How** — approach hints, relevant code paths, patterns to follow

If you can't fill in all four, the scope is still unclear — go back to Phase 1.

---

## Phase 5 — Test Planning Integration

After the implementation issues are created, invoke **test-planning**:

```
/test-planning
```

test-planning will:
1. Classify each implementation issue by layer (core / boundary / shell)
2. Pick the right testing strategy per layer
3. Create companion test issues batched by layer and phase
4. Gate next-phase issues on test completion

**When to call it:**
- Always after creating an epic with 3+ implementation tasks
- When closing an implementation issue (test-planning checks for gaps)
- When you realize tests weren't planned upfront

**Layer signals to include in your issue descriptions** (helps test-planning classify correctly):
- Core layer: "transforms", "computes", "parses", "validates", no HTTP/DB/filesystem
- Boundary layer: "API", "endpoint", "client", "query", "fetch", URLs, ports
- Shell layer: "CLI command", "subcommand", "orchestrates", "wires together"

---

## Phase 6 — Handoff

Present the board and transition to implementation:

```bash
# Show the full board
bd show <epic-id>

# Claim the first implementation issue
bd update <first-task-id> --claim
```

Then begin work on the first task. The planning phase is complete.

---

## Examples

### Example 1 — New CLI command

<example>
  <scenario>User: "add a `xtrm audit` command that checks for stale hooks"</scenario>

  <exploration>
    gitnexus_query({query: "hook wiring audit clean"})
    → finds: cleanOrphanedHookEntries, pruneStaleWrappers in clean.ts
    gitnexus_impact({target: "cleanOrphanedHookEntries", direction: "upstream"})
    → 2 callers, LOW risk
  </exploration>

  <plan>
    Phase 1: Add audit command skeleton (new file, register in index.ts)
    Phase 2: Implement hook validation logic (read config/hooks.json, compare installed)
    Phase 3: Add --fix flag to auto-remediate drift
    Phase 4: Tests — CLI integration test (shell layer)
  </plan>

  <bd_commands>
    bd create --title="xtrm audit: detect and report stale hook wiring" --type=epic
    bd create --title="Scaffold xtrm audit command" --description="Context: ..." --type=task
    bd create --title="Implement hook validation — compare config/hooks.json to settings.json" ...
    bd create --title="Add --fix flag for auto-remediation" ...
    bd dep add <wiring-id> <scaffold-id>    # wiring depends on scaffold
    bd dep add <fix-id> <wiring-id>         # fix depends on wiring
  </bd_commands>
</example>

### Example 2 — Bug fix with investigation

<example>
  <scenario>User: "bd close sometimes doesn't auto-commit"</scenario>

  <exploration>
    gitnexus_query({query: "bd close auto-commit"})
    → finds: beads-claim-sync.mjs, close event handler
    find_symbol("handleClose", include_body=true)
    → discovers: auto-commit only fires if tracked files changed, not untracked
  </exploration>

  <thinking>
    Root cause identified: git commit -am skips untracked files.
    Fix: check git ls-files --others before committing.
    Risk: LOW — only beads-claim-sync.mjs changes.
    Single task, no phases needed.
  </thinking>

  <bd_command>
    bd create \
      --title="Fix bd close auto-commit skips untracked new files" \
      --description="Context: beads-claim-sync.mjs uses 'git commit -am' which skips
      untracked files. Fix: add 'git ls-files --others --exclude-standard' check and
      'git add -A' scoped to expected paths before committing.
      AC: [ ] auto-commit includes new untracked files [ ] existing behavior preserved"
      --type=bug --priority=1
  </bd_command>
</example>

### Example 3 — Greenfield feature from spec

<example>
  <scenario>User provides a 3-paragraph spec for a new xtrm status command</scenario>

  <approach>
    Phase 0: Define TypeScript interfaces (StatusReport, HealthCheck)
    Phase 1: Implement each health check function (hooks, settings, bd, mcp)
    Phase 2: Implement CLI command, output formatting, --json flag
    Phase 3: Tests — unit for each check fn (core), integration for CLI (shell)

    Create epic first, then 4 implementation tasks, then call /test-planning.
  </approach>
</example>

---

## Self-Check Before Finishing

Before presenting the plan to the user:

- [ ] Every issue has context / what / AC / notes
- [ ] Dependencies are correct (A blocks B when B needs A's output)
- [ ] No task is more than "one session" of work (split if needed)
- [ ] test-planning was invoked (or scheduled as next step)
- [ ] First implementation issue is ready to claim

If any issue description is empty or just restates the title — it's not ready.
The test of a good issue: could another agent pick it up cold and succeed?
