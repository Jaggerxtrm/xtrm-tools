---
name: sync-docs
description: >-
  Doc audit and structural sync for xtrm projects. Use whenever the README
  feels too long, docs are out of sync after a sprint, the CHANGELOG is behind,
  or the user asks to "sync docs", "doc audit", "split readme", "check docs
  health", or "detect drift". Reads bd issues and git history, then runs
  docs-only drift detection on README.md, CHANGELOG.md, and docs/ — creating
  missing focused files instead of a monolithic README.
gemini-command: sync-docs
version: 1.2.0
---

# sync-docs

Keeps project documentation in sync with code reality.

## Overview

```
Phase 1: Gather context     — what changed recently?
Phase 2: Detect docs drift  — which docs/ files are stale?
Phase 3: Analyze structure  — what belongs outside README?
Phase 4: Plan + execute     — fix docs and changelog
Phase 5: Validate           — schema-check all docs/
```

**Audit vs Execute mode:** If the user asked for an audit/report/check-only task, stop after Phase 3. Only run fixes when the user explicitly asks for changes.

---

## Phase 1: Gather Context

```bash
# Global install
python3 "$HOME/.agents/skills/sync-docs/scripts/context_gatherer.py" [--since=30]

# From repository
python3 "skills/sync-docs/scripts/context_gatherer.py" [--since=30]
```

Outputs JSON with:
- recently closed bd issues
- merged PRs from git history
- recent commits
- docs drift report from `sync-docs/scripts/drift_detector.py`

---

## Phase 2: Detect docs/ Drift

```bash
python3 "skills/sync-docs/scripts/drift_detector.py" scan --since 30
# optional JSON:
python3 "skills/sync-docs/scripts/drift_detector.py" scan --since 30 --json
```

A docs file is stale when:
1. It declares `source_of_truth_for` globs in frontmatter
2. AND there are commits affecting matching files AFTER the `synced_at` hash

### synced_at Checkpoint

Add `synced_at: <git-hash>` to doc frontmatter to mark the last sync point:

```yaml
---
title: Hooks Reference
updated: 2026-03-21
synced_at: a1b2c3d  # git hash when doc was last synced
source_of_truth_for:
  - "hooks/**/*.mjs"
---
```

After updating a doc, run:
```bash
python3 "skills/sync-docs/scripts/drift_detector.py" update-sync docs/hooks.md
```

This sets `synced_at` to current HEAD, marking the doc as synced.

---

## Phase 3: Analyze Document Structure

```bash
python3 "skills/sync-docs/scripts/doc_structure_analyzer.py"
```

Checks:
1. README bloat/extractable sections
2. CHANGELOG staleness (date + version gap)
3. Missing focused docs files
4. Invalid docs schema (missing frontmatter)

Statuses: `BLOATED`, `EXTRACTABLE`, `MISSING`, `STALE`, `INVALID_SCHEMA`, `OK`.

If this is audit-only, stop here and report.

---

## Phase 4: Execute Fixes

| Situation | Action |
|---|---|
| README bloated | Extract large sections to focused docs files |
| Missing docs file | Generate scaffold via `validate_doc.py --generate` |
| Stale docs file | Update content + bump `version` + `updated` |
| Stale CHANGELOG | Add entry with local changelog script |
| Invalid schema | Fix frontmatter and regenerate INDEX |

### Auto-fix known gaps

```bash
python3 "skills/sync-docs/scripts/doc_structure_analyzer.py" --fix
python3 "skills/sync-docs/scripts/doc_structure_analyzer.py" --fix --bd-remember
```

### Create one docs scaffold

```bash
python3 "skills/sync-docs/scripts/validate_doc.py" --generate docs/hooks.md \
  --title "Hooks Reference" --scope "hooks" --category "reference" \
  --source-for "hooks/**/*.mjs,policies/*.json"
```

### Validate and regenerate metadata/index

```bash
python3 "skills/sync-docs/scripts/validate_metadata.py" docs/
```

### Add changelog entry

```bash
python3 "skills/sync-docs/scripts/changelog/add_entry.py" \
  CHANGELOG.md Added "Describe the documentation update"
```

---

## Phase 5: Final Validation

```bash
python3 "skills/sync-docs/scripts/validate_doc.py" docs/
python3 "skills/sync-docs/scripts/drift_detector.py" scan --since 30
```

---

## Frontmatter Schema

All `docs/*.md` files require valid YAML frontmatter. Scripts only validate `docs/*.md` (not subdirectories).

### Required Fields

| Field | Format | Example |
|-------|--------|---------|
| `title` | string (quote if contains colon) | `"Session-Flow: Pi Parity"` |
| `scope` | string | `hooks` |
| `category` | enum (see below) | `reference` |
| `version` | semver | `1.0.0` |
| `updated` | date | `2026-03-22` |

### Valid Categories

Only these values pass validation:

| Category | Use for |
|----------|---------|
| `api` | API documentation |
| `architecture` | System design, architecture decisions |
| `guide` | How-to guides, tutorials |
| `overview` | High-level introductions |
| `plan` | Planning documents, roadmaps |
| `reference` | Reference documentation |

**Invalid**: `roadmap`, `deprecated`, `complete` — will fail validation.

### YAML Quoting

Titles with special characters (colons, quotes) must be quoted:

```yaml
# ✅ Correct
title: "Session-Flow: Pi Parity"
title: "What's New in v2.0"

# ❌ Incorrect — YAML parse error
title: Session-Flow: Pi Parity
title: What's New in v2.0
```

### Optional Fields

| Field | Format | Use |
|-------|--------|-----|
| `description` | string (quoted) | Brief summary |
| `source_of_truth_for` | list of globs | Link to code areas |
| `synced_at` | git hash | Drift checkpoint |
| `domain` | list of tags | Categorization |

---

## docs/ as SSOT

`docs/` is the only source of truth for project documentation in this workflow.
Scripts validate `docs/*.md` only — subdirectories (`docs/plans/`, `docs/reference/`) are ignored.
Use frontmatter (`source_of_truth_for`) to link docs pages to code areas and detect drift.
