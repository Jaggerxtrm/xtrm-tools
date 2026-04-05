---
name: sync-docs
description: >-
  Mode-routed documentation sync for xtrm projects. Three modes: targeted
  (named docs only), area (time-windowed + source scope), full audit.
  Commit-based context gathering, not PR-based. Use whenever docs need
  syncing after code changes, the user asks to "sync docs", "update docs",
  "doc audit", "check docs health", or "detect drift".
gemini-command: sync-docs
version: 2.0.0
---

# sync-docs

Keeps project documentation in sync with code reality.

## Overview

```
Phase 0: Route mode/scope   — targeted, area, or full audit?
Phase 1: Gather context      — commits, issues, changed files in window
Phase 2: Inspect with xtrm   — what does the docs suite report?
Phase 3: Detect drift         — which docs are stale?
Phase 4: Plan delta           — what to edit vs report
Phase 5: Execute fixes        — update docs within scope
Phase 6: Validate             — confirm no remaining drift
```

**Audit vs Execute:** Bead-linked runs execute all phases. Non-bead runs with
"audit/check/report" stop after Phase 4. Non-bead runs with "update/fix/sync"
execute.

---

## Phase 0: Route Mode and Scope

Determine your mode BEFORE gathering context. This controls everything downstream.

### Mode precedence

| Priority | Condition | Mode |
|----------|-----------|------|
| 1 | Prompt contains explicit doc file paths | **Targeted** |
| 2 | Prompt contains time window + directory/source scope | **Area** |
| 3 | Everything else | **Full audit** |

### Mode behaviors

**Targeted** — edit ONLY the named docs. Gather recent context for understanding.
Report collateral docs that likely also need updates but do NOT edit them.

**Area** — derive candidate docs from changed source paths within the time window.
Use drift detector to confirm staleness. Edit candidate docs within derived scope.

**Full audit** — run complete docs audit. Contextualize with recent commits/issues.
Use drift detector + structure analyzer for comprehensive coverage.

### Execution policy

| Condition | Action |
|-----------|--------|
| `$bead_id` present | Execute (all phases) |
| No bead + "audit"/"check"/"report"/"what's stale" | Report only (stop Phase 4) |
| No bead + "update"/"fix"/"sync" | Execute |

---

## Phase 1: Gather Scoped Context

### Context gatherer

The context gatherer supports time-window and scope-aware gathering:

```bash
# Targeted: specific docs + time window
python3 .xtrm/skills/default/sync-docs/scripts/context_gatherer.py \
  --doc docs/features.md --doc docs/cli-reference.md --since-hours 24

# Area: source scope + time window
python3 .xtrm/skills/default/sync-docs/scripts/context_gatherer.py \
  --scope-path src/specialist/ --since-hours 24

# Area: broader window
python3 .xtrm/skills/default/sync-docs/scripts/context_gatherer.py \
  --scope-path src/cli/ --since-days 7

# Full audit: broad window
python3 .xtrm/skills/default/sync-docs/scripts/context_gatherer.py \
  --since-days 7

# Legacy compat (commit count)
python3 .xtrm/skills/default/sync-docs/scripts/context_gatherer.py \
  --since-commits 30
```

**Default:** `--since-hours 24` when no window specified.

Outputs JSON with:
- `mode_hint`: targeted / area / full
- `window`: type + value + git_since
- `scope`: doc targets + source paths
- `git.recent_commits`: commits with changed files
- `git.changed_files`: unique files ranked by change frequency
- `git.changed_dirs`: directory-level summary
- `bd.closed_issues`: recently closed issues
- `docs`: drift detector results

### xtrm docs suite

Use for operator-facing inspection:

```bash
xtrm docs list --json
xtrm docs show --json
xtrm docs cross-check --json --days 30
```

---

## Phase 2: Inspect Docs State

Use `xtrm docs` to answer:
- What docs exist and their metadata?
- Which have missing or outdated frontmatter?
- Coverage gaps between recent work and docs?

If the CLI already isolates the problem clearly, skip to Phase 4.

---

## Phase 3: Detect Drift

Use the drift detector filtered to your scope:

```bash
# All docs
python3 .xtrm/skills/default/sync-docs/scripts/drift_detector.py scan --json

# With commit window
python3 .xtrm/skills/default/sync-docs/scripts/drift_detector.py scan --since 30 --json
```

A doc is stale when:
1. It declares `source_of_truth_for` globs in frontmatter
2. AND commits affecting matching files exist AFTER the `synced_at` hash

### Staleness model

- **Time windows** decide what recent work to consider now (relevance)
- **`synced_at` / hash-based drift** decides whether a doc is actually stale (truth)
- **Fallback**: when metadata is missing, time-window heuristics prioritize review

---

## Phase 4: Plan Delta

Before editing, identify:
- Docs to update (within scope)
- Docs to leave untouched
- Collateral docs to report only (targeted mode)

**If audit-only, stop here and output the report.**

Include both:
- `xtrm docs` findings (operator-facing)
- Python analyzer findings (drift/structure enforcement)

---

## Phase 5: Execute Fixes

| Situation | Action |
|-----------|--------|
| Stale docs file | Update content + bump `version` + `updated` |
| README bloated | Extract large sections to focused docs files |
| Missing docs file | Generate scaffold via `validate_doc.py --generate` |
| Stale CHANGELOG | Add entry with changelog script |
| Invalid schema | Fix frontmatter |

### After each doc update

Stamp the sync checkpoint:
```bash
python3 .xtrm/skills/default/sync-docs/scripts/drift_detector.py update-sync <doc-path>
```

### Targeted mode boundary

In targeted mode, ONLY edit the named docs. If you discover other docs need
updating, list them in your output as "Suggested follow-ups" — do not edit them.

### Structure analysis (full audit only)

```bash
python3 .xtrm/skills/default/sync-docs/scripts/doc_structure_analyzer.py
python3 .xtrm/skills/default/sync-docs/scripts/doc_structure_analyzer.py --fix
```

### Add changelog entry

```bash
python3 .xtrm/skills/default/sync-docs/scripts/changelog/add_entry.py \
  CHANGELOG.md Added "Describe the documentation update"
```

---

## Phase 6: Validate

Re-run both layers:

```bash
xtrm docs list --json
xtrm docs cross-check --json --days 30
python3 .xtrm/skills/default/sync-docs/scripts/drift_detector.py scan --json
```

Confirm updated docs no longer show as stale.

---

## Frontmatter Schema

All `docs/*.md` files require valid YAML frontmatter.

### Required Fields

| Field | Format | Example |
|-------|--------|---------|
| `title` | string | `"Hooks Reference"` |
| `scope` | string | `hooks` |
| `category` | enum | `reference` |
| `version` | semver | `1.0.0` |
| `updated` | date | `2026-03-22` |

### Valid Categories

`api` | `architecture` | `guide` | `overview` | `plan` | `reference`

### Optional Fields

| Field | Format | Use |
|-------|--------|-----|
| `description` | string | Brief summary |
| `source_of_truth_for` | list of globs | Link to code areas |
| `synced_at` | git hash | Drift checkpoint |
| `domain` | list of tags | Categorization |

---

## Command Selection Rules

**`xtrm docs` first** for understanding current docs state:
- `xtrm docs list --json` — inventory
- `xtrm docs show --json` — frontmatter inspection
- `xtrm docs cross-check --json` — drift, coverage gaps

**Python scripts** for enforcement and sync internals:
- `drift_detector.py` — `synced_at` / `source_of_truth_for` checks
- `doc_structure_analyzer.py` — README bloat, missing docs, changelog gaps
- `validate_metadata.py` / `validate_doc.py` — schema/index validation
- `context_gatherer.py` — scoped commit/issue context for sync decisions
