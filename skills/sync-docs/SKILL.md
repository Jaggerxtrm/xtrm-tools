---
name: sync-docs
description: >-
  Context-aware documentation sync for xtrm projects. Reads recently closed bd
  issues, merged PRs, and bd memories to understand what changed, then detects
  drift in README.md, CHANGELOG.md, and docs/ structure, and creates focused
  docs/ files using Serena LSP instead of monolithic READMEs. This is the
  xtrm-enhanced successor to /documenting — use it when finishing a feature
  cycle, when README.md feels too long, when syncing docs after a sprint,
  or when asked to "doc audit", "sync docs", "split readme", or "check docs
  health". Also use it proactively after merging PRs or closing the last bd
  issue of a cycle. Always prefer this over /documenting when context from
  bd issues or structural reorganization is needed.
gemini-command: sync-docs
version: 1.0.0
---

# sync-docs

Keeps documentation in sync with reality. Reads what was done (bd issues, PRs, memories), finds what's stale or structurally wrong, and fixes it with Serena precision.

## Overview

```
Phase 1: Gather context     — what was done recently?
Phase 2: Detect drift       — what's stale in SSOT memories?
Phase 3: Analyze structure  — what's in the wrong place?
Phase 4: Plan + execute     — fix with Serena  (SKIP if audit/read-only task)
Phase 5: Validate           — schema-check all docs/
```

**Audit vs Execute mode:** If the user asked for an audit, report, or "just check", stop after Phase 3 — do not run `--fix` or edit any files. Only proceed to Phase 4 when the user explicitly wants changes made.

---

## MANDATORY FIRST STEP

Activate the Serena project before any file edits:

```javascript
mcp__serena__activate_project({ project: "<cwd>" })
```

---

## Phase 1: Gather Context

```bash
# If skill is installed globally:
python3 "$HOME/.claude/skills/sync-docs/scripts/context_gatherer.py" [--since=30]

# If running from the repo directly:
python3 "skills/sync-docs/scripts/context_gatherer.py" [--since=30]
```

Outputs a JSON report with:
- Recently closed bd issues (id, title, closed date)
- Merged PRs (subject, merge date) from git history
- bd memories persisted this cycle (`bd memory list` if available)
- Stale Serena memories (delegates to drift_detector.py)

If no `.beads/` directory exists, falls back to git-only context. All output is JSON — read it and keep the key findings in mind for Phase 3.

---

## Phase 2: Detect SSOT Drift

```bash
python3 "$HOME/.claude/skills/documenting/scripts/drift_detector.py" scan
```

This checks which Serena memories have `tracks:` globs matching recently modified files. If something is stale, note the memory name. You will handle it in Phase 4 using the same update steps as `/documenting` — but with Serena tools (not Edit/Write).

> **Note:** `drift_detector.py` requires `pyyaml`. If you see `ModuleNotFoundError: No module named 'yaml'`, skip Phase 2 and note it — the rest of the skill works without it. Do not `pip install` unless the user explicitly approves.

---

## Phase 3: Analyze Document Structure

```bash
# Analysis only (no changes) — always safe to run:
python3 "$HOME/.claude/skills/sync-docs/scripts/doc_structure_analyzer.py"
# or from repo: python3 "skills/sync-docs/scripts/doc_structure_analyzer.py"
```

Checks:
1. **README.md bloat** — flags if > 200 lines or contains sections that belong in `docs/`
2. **CHANGELOG.md coverage** — date gap AND version gap (package.json vs latest changelog entry)
3. **docs/ gaps** — expected focused files that don't exist yet
4. **Schema validity** — existing docs/ files missing YAML frontmatter

Reports are categorized as `BLOATED`, `EXTRACTABLE`, `MISSING`, `STALE`, `INVALID_SCHEMA`, or `OK`.

**If the task is audit/analysis only → stop here.** Summarize findings and present to the user. Do not run `--fix` without explicit intent to make changes.

Read `references/doc-structure.md` for the complete guide on what belongs in each docs/ file.

---

## Phase 4: Decide and Execute

| Situation | Action |
|---|---|
| README bloated + section belongs in docs/ | Extract → new `docs/X.md`, replace with summary + link |
| docs/ file missing for existing subsystem | Create `docs/X.md` with schema frontmatter |
| Serena memory stale | Update memory using Serena tools (see below) |
| bd issue closed, no doc reflects it | Update CHANGELOG + relevant doc |
| docs/ file schema invalid | Fix frontmatter, regenerate INDEX |
| Everything clean | Report "All docs in sync" and stop |

### Editing with Serena (required for all doc edits)

Never use the raw `Edit` tool on documentation files. Always go through Serena:

```javascript
// 1. Map structure first
mcp__serena__get_symbols_overview({ relative_path: "README.md", depth: 1 })

// 2. Read only the relevant section
mcp__serena__find_symbol({ name: "Section Name", include_body: true })

// 3. Replace section content
mcp__serena__replace_symbol_body({ symbol_name: "Section Name", new_body: "..." })

// 4. Insert a new section after an existing one
mcp__serena__insert_after_symbol({ symbol_name: "Existing Section", new_symbol: "..." })
```

The reason this matters: Serena edits are atomic and reference-safe. Direct edits on large markdown files risk corrupting heading structure or inserting duplicates.

### Auto-scaffolding missing docs/ files (--fix)

For known subsystem patterns (hooks/, policies/, skills/, etc.), run `--fix` to generate all missing scaffolds at once:

```bash
python3 "$HOME/.claude/skills/sync-docs/scripts/doc_structure_analyzer.py" --fix
```

Combine with `--bd-remember` to persist a summary insight for future sessions:

```bash
python3 "$HOME/.claude/skills/sync-docs/scripts/doc_structure_analyzer.py" --fix --bd-remember
```

`--fix` only handles known MISSING patterns. README extraction (BLOATED/EXTRACTABLE) still requires Serena — content judgment is needed to split correctly.

### Creating a single docs/ file manually

Generate the scaffold with valid frontmatter:

```bash
python3 "$HOME/.claude/skills/sync-docs/scripts/validate_doc.py" --generate docs/hooks.md \
  --title "Hooks Reference" --scope "hooks" --category "reference" \
  --source-for "hooks/**/*.mjs,policies/*.json"
```

Then fill content using Serena. See `references/schema.md` for all frontmatter fields.

### Updating Serena memories (when drift detected)

1. Read the `<!-- INDEX -->` block only — identify stale sections
2. Use `mcp__serena__search_for_pattern` to jump to stale content
3. Use `mcp__serena__replace_symbol_body` to update
4. Bump `version:` (patch = content fix, minor = new section) and `updated:` in frontmatter
5. Regenerate INDEX:

```bash
python3 "$HOME/.claude/skills/documenting/scripts/validate_metadata.py" <memory-file>
```

### Updating CHANGELOG

```bash
python3 "$HOME/.claude/skills/documenting/scripts/changelog/add_entry.py" \
  CHANGELOG.md <type> "<summary>"
```

Types: `Added`, `Changed`, `Fixed`, `Removed`.

### Persisting insights via bd remember

After significant doc work (new docs/ files created, README reorganized, major drift fixed), persist a summary for future sessions:

```bash
bd remember "<what was done and why>" --key sync-docs-<scope>-<YYYY-MM-DD>
```

Examples:
```bash
bd remember "docs/hooks.md created — extracted from README section + 12 hook scripts cataloged" --key sync-docs-hooks-2026-03-18
bd remember "README trimmed from 340 to 180 lines — policies, hooks, MCP moved to docs/" --key sync-docs-readme-trim-2026-03-18
```

This is done automatically when using `--fix --bd-remember`, but do it manually too when making structural changes via Serena.

---

## Phase 5: Validate

Run schema validation on all docs/ files before finishing:

```bash
python3 "$HOME/.claude/skills/sync-docs/scripts/validate_doc.py" docs/
```

Exits 0 if all pass. Fix any errors before reporting completion.

---

## Standard docs/ Structure

See `references/doc-structure.md` for the complete guide. At minimum, a mature xtrm project should have:

```
docs/
├── hooks.md              # Hook events, scripts, and their behavior
├── pi-extensions.md      # Pi/Copilot extension catalog
├── architecture.md       # System design, key components
└── plans/                # In-progress and completed work plans
```

If any of these are missing and the project has the relevant code, create them.

---

## Relationship to /documenting

| Use `/sync-docs` when | Use `/documenting` when |
|---|---|
| Finishing a feature cycle | Just adding a CHANGELOG entry |
| README feels too big | Creating a single Serena memory |
| After merging multiple PRs | Updating one stale memory |
| Need bd context to know what changed | The scope is already clear |
| Structural reorganization needed | No structural changes needed |

`/documenting` inherits the changelog scripts from this skill. Both can run in the same repo — they don't conflict.
