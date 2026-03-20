<!-- xtrm:start -->
# XTRM Agent Workflow (Short)

This file is an **agent operating manual** (not a project overview).

1. **Start with scope**
   - Clarify task intent if ambiguous.
   - Prefer semantic discovery (Serena + GitNexus) over broad grep-first exploration.

2. **Track work in `bd`**
   - Use `bd ready --json` / `bd update <id> --claim --json` before edits.
   - Create discovered follow-ups with `--deps discovered-from:<id>`.

3. **Branch per issue (strict)**
   - Create a **new branch for each issue** from latest `main`.
   - Do **not** continue new work on a previously used branch.
   - Branch format: `feature/<issue-id>-<short-description>` (or `fix/...`, `chore/...`).

4. **Edit safely**
   - Use Serena symbol tools for code changes when possible.
   - Run GitNexus impact checks before symbol changes and detect-changes before commit.

5. **PR merge + return to main**
   - Always merge via PR (squash merge preferred).
   - After merge: switch to `main` and sync (`git reset --hard origin/main`).
   - Delete merged branch locally and remotely (`git branch -d <branch>` and `git push origin --delete <branch>`).

6. **Before finishing**
   - Run relevant tests/linters.
   - Close/update bead state.
   - Ensure changes are committed and pushed.
<!-- xtrm:end -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **xtrm-tools** (3558 symbols, 9856 relationships, 262 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/xtrm-tools/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/xtrm-tools/context` | Codebase overview, check index freshness |
| `gitnexus://repo/xtrm-tools/clusters` | All functional areas |
| `gitnexus://repo/xtrm-tools/processes` | All execution flows |
| `gitnexus://repo/xtrm-tools/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->

## Issue Tracking

This project uses **[bd (beads)](https://github.com/steveyegge/beads)** — a git-backed issue tracker with first-class dependency support and persistent memory across conversation compaction.

### Session Protocol

```bash
bd ready                        # Find unblocked work
bd show <id>                    # Get full context on an issue
bd update <id> --claim          # Claim and start work atomically
bd close <id> --reason "..."    # Complete task
bd dolt push                    # Push to remote (if configured)
```

### Creating Issues

```bash
bd create "Title" --type task --priority 2   # Standard task
bd q "Quick capture title"                   # Quick capture, outputs ID only
bd todo add "Small task"                     # Convenience wrapper for tasks
```

### Dependencies & Structure

```bash
bd dep add <id> --blocked-by <other-id>   # Set dependency
bd blocked                                 # Show blocked issues
bd graph                                   # Visualize dependency graph
bd epic list                               # List epics
```

### Viewing & Searching

```bash
bd list                          # All open issues
bd search "query"                # Text search
bd stale                         # Issues not updated recently
bd status                        # Database overview + stats
bd find-duplicates               # Find semantically similar issues
```

### Advanced

```bash
bd agent --help                  # Agent bead state tracking
bd gate --help                   # Async coordination gates (human-in-the-loop)
bd mol --help                    # Molecules — reusable work templates
bd audit                         # Append-only agent interaction log
bd prime                         # AI-optimized workflow context (full reference)
```

### When to Use bd vs TodoWrite

| Use **bd** | Use **TodoWrite** |
|---|---|
| Work spans multiple sessions | Single-session tasks |
| Tasks have dependencies/blockers | Linear execution |
| Need to survive conversation compaction | All context in current conversation |
| Team collaboration / git sync | Local to session |

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs via Dolt:

- Each write auto-commits to Dolt history
- Use `bd dolt push`/`bd dolt pull` for remote sync
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Feature-Branch Workflow

**ALL changes go through a feature branch and PR. Direct commits or pushes to `main`/`master` are blocked by hooks.**

### Why Feature Branches?

- **Traceability**: Every change is linked to a PR with context, review, and CI checks
- **Rollback safety**: Squash merges keep history linear and easy to revert
- **CI enforcement**: Tests and linters run on every PR before merge

### Full Workflow

```bash
# 1. Start from main — always create a fresh branch
git checkout main
git checkout -b feature/<issue-id>-<short-description>

# 2. Track your work with beads
bd update <issue-id> --claim          # Claim the issue

# 3. Make your changes
# ... edit files, write tests ...

# 4. Commit your work
bd close <issue-id> --reason "Done"   # Close the issue
git add -A && git commit -m "Brief description"

# 5. Push and create PR
git push -u origin feature/<branch-name>
gh pr create --fill                    # Creates PR with auto-filled title/body

# 6. Merge via squash
gh pr merge --squash                   # Squash merge keeps history clean

# 7. Sync main — use reset, not pull
git checkout main
git reset --hard origin/main           # Match remote exactly
```

### Why `git reset --hard` Instead of `git pull`?

After a squash merge, `git pull` creates a merge commit because your local `main` has diverged from the remote (your local has the feature branch commits, but remote has the squashed single commit). `reset --hard` discards the local feature branch state and matches the remote exactly — no merge noise, no conflicts.

### Key Rules

| ✅ Do | ❌ Don't |
|-------|----------|
| `git checkout -b feature/<name>` from main | Commit directly on main |
| `gh pr merge --squash` | `gh pr merge --merge` or `--rebase` |
| `git reset --hard origin/main` after merge | `git pull` after squash merge |
| Create PR before merging | Push directly to main |

### Branch Naming Convention

Use descriptive names that include the issue ID:
- `feature/jaggers-agent-tools-123-add-login-flow`
- `fix/jaggers-agent-tools-456-null-pointer`
- `chore/jaggers-agent-tools-789-update-deps`

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
