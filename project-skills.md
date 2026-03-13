# Project Skills Module

This document explains project-local skills installed into a repository’s `.claude/` directory.

## What This Module Is

`project-skills/` contains installable packages that are scoped to one codebase.  
Unlike global `skills/`, these are meant to enforce local workflow rules and quality gates.

## Installation Flow

```bash
xtrm install project list
xtrm install project <skill-name>
xtrm install project all
```

What install does:
1. copies skill assets into the project `.claude/` tree
2. merges hook entries into project `.claude/settings.json` (non-destructive merge)
3. wires any skill-specific docs/hooks/scripts shipped with the skill

## Current Project Skills

| Project Skill | What It Enforces | Typical Trigger |
|---|---|---|
| `py-quality-gate` | ruff + mypy checks after edits | `PostToolUse` (Write/Edit/MultiEdit) |
| `ts-quality-gate` | TS + ESLint + Prettier checks after edits | `PostToolUse` (Write/Edit/MultiEdit) |
| `tdd-guard` | test-first behavior before implementation | `SessionStart`, `PreToolUse`, `UserPromptSubmit` |
| `service-skills-set` | service-aware operational context and drift checks | `SessionStart`, `PreToolUse`, `PostToolUse` |

## When To Use Which Skill

- Python-heavy backend: start with `py-quality-gate`
- TypeScript app/service: start with `ts-quality-gate`
- Team wants strict test-first discipline: add `tdd-guard`
- Multi-service Docker project with recurring domain context: add `service-skills-set`

`xtrm install project all` is appropriate when the repository contains mixed stacks and you want full guardrails.

## Requirements Per Skill

- `py-quality-gate`: Python runtime and local `ruff`/`mypy` availability
- `ts-quality-gate`: Node toolchain and local `typescript`/`eslint`/`prettier`
- `tdd-guard`: Node 22+ and reporter integration in your test runner
- `service-skills-set`: Python + git repo + service definitions for meaningful territory mapping

## Common Failures and Fixes

- Hook installed but not firing:
  - verify matcher includes the tool (`Write|Edit|MultiEdit`)
  - verify skill files were copied under project `.claude/`
- Tooling command missing:
  - install required language dependencies in the project
- Unexpected behavior after merge:
  - inspect resulting `.claude/settings.json` and resolve overlapping custom hooks

## Per-Skill References

- `project-skills/py-quality-gate/README.md`
- `project-skills/ts-quality-gate/README.md`
- `project-skills/tdd-guard/README.md`
- `project-skills/service-skills-set/README.md`

## Related Docs

- Root overview: `README.md`
- Global skills: `skills.md`
- Global hooks: `hooks.md`

## Verified Completed Issues (2026-03-13)

- `jaggers-agent-tools-w8n`: aligned docs and hook matchers with implemented behavior (including MultiEdit)
- `jaggers-agent-tools-4v4`: added YAML frontmatter descriptions to project-skill `SKILL.md` files
- `jaggers-agent-tools-t4o`: corrected stale hook filename references (`.cjs`)
- `jaggers-agent-tools-rbf`: fixed hook-trigger misdescriptions in quality-gate docs
- `jaggers-agent-tools-bvg`: added no-match fallback guidance for service-skills usage
- `jaggers-agent-tools-4h2`: tightened mypy example defaults in Python quality-gate guidance
- `jaggers-agent-tools-bug`: removed filler sections from `using-main-guard` docs
- `jaggers-agent-tools-nj0`: removed `main-guard` from `project-skills/` (owned by global hooks)
