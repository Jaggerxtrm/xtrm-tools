---
name: session-close-report
description: |
  Generate a structured technical handoff report at session close.
  You run `xt report generate` to get the data skeleton, then fill every
  <!-- FILL --> section from your own session context. The result is the
  definitive handoff contract for the next agent.
---

# session-close-report

## When to use

Invoke this skill at the end of a productive session — after issues are closed,
code is committed, but before final push. It produces the handoff report that
the next agent reads to start cold without losing context.

## Workflow

### 1. Generate the skeleton

```bash
xt report generate
```

This collects data from git log, bd, .specialists/jobs/ and writes a skeleton
to `.xtrm/reports/<date>-<hash>.md` with YAML frontmatter and pre-filled tables.

### 2. Read the skeleton

Read the generated file. It has `<!-- FILL -->` markers in every section that
needs your input.

### 3. Fill every section from your context

You are the orchestrator. You have the full session context. The CLI only
collected raw data — you provide the meaning.

**For each section, here is exactly what to write:**

#### Summary
One dense paragraph. What was accomplished, key decisions made, discoveries,
outcomes. Technical prose — no filler, no "in this session we...". Lead with
the most important result.

#### Issues Closed
The skeleton has a flat table. Restructure it:
- Group by category: bugs discovered, backlog items, cleanup/closures, features
- If specialists were used, add Specialist and Wave columns
- Expand terse close reasons into useful context

#### Issues Filed
Add every issue you created this session. The **Why** column is mandatory —
explain the rationale for filing, not just what the issue says.

Update the `issues_filed` count in frontmatter.

#### Specialist Dispatches
If specialists were dispatched:
- Build a Wave summary table: Wave number, specialists, models, outcomes
- Add a Problems sub-table for any failed/stalled dispatches
- Update `specialist_dispatches` and `models_used` in frontmatter

If no specialists were used, delete this section.

#### Problems Encountered
Every problem hit during the session. Root Cause and Resolution columns are
mandatory. Include: bugs discovered, wrong approaches tried, blockers hit,
tooling failures. If no problems, delete this section entirely.

#### Code Changes
The skeleton lists files. Add narrative:
- Explain key modifications (not every file — focus on the important ones)
- Group logically if many changes (e.g., "CLI commands", "Hook changes")
- Note architectural decisions embedded in the changes

#### Documentation Updates
List doc changes, skill updates, memory saves, CHANGELOG entries.
Delete if no doc work happened.

#### Open Issues with Context
This is the most valuable handoff section. For each open issue:
- **Context / Suggestions**: What the next agent needs to know. Current state,
  blockers discovered, suggested approach, files to look at, gotchas.
- Group into "Ready for next session" and "Backlog" subsections
- Put the most actionable items first

#### Memories Saved
List all `bd remember` calls made this session. If the skeleton missed any,
add them. If none were saved, note why (nothing novel, or deferred).

#### Suggested Next Priority
Ordered list of 1-4 items with rationale for each. Based on:
- Dependency order (what unblocks the most)
- User's stated intent (if they mentioned what's next)
- Urgency of discovered issues
- Blocked items about to unblock

### 4. Update frontmatter

Ensure all frontmatter counts are accurate after filling:
- `issues_filed` — actual count
- `specialist_dispatches` — actual count
- `models_used` — list of models that did work this session

### 5. Commit the report

```bash
git add .xtrm/reports/
git commit -m "session report: <date>"
```

## Quality bar

The reference is `~/projects/specialists/.xtrm/reports/2026-03-30-orchestration-session.md`.
Every report must match that level of detail. Specifically:

- No empty `<!-- FILL -->` markers left in the final output
- Every closed issue has context, not just an ID
- Every open issue has actionable handoff suggestions
- Problems section captures root causes, not just symptoms
- Summary is a dense technical paragraph, not a list of bullet points

## CLI commands

| Command | Purpose |
|---------|---------|
| `xt report generate` | Collect data, write skeleton |
| `xt report show [target]` | Display latest or specified report |
| `xt report list` | List all reports with frontmatter summary |
| `xt report diff <a> <b>` | Compare two reports |
