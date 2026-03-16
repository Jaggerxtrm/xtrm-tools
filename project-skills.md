# Project Skills Module

This document explains project-local skills installed into a repository's `.claude/` directory.

## What This Module Is

`project-skills/` contains installable packages that are scoped to one codebase.  
Unlike global `skills/`, these are meant to enforce local workflow rules and quality gates.

## Installation Flow

```bash
xtrm install project list
xtrm install project <skill-name>
xtrm install project all
xtrm project init
```

What install does:
1. copies skill assets into the project `.claude/` tree
2. merges hook entries into project `.claude/settings.json` (non-destructive merge)
3. wires any skill-specific docs/hooks/scripts shipped with the skill

## Current Project Skills

| Project Skill | What It Enforces | Typical Trigger |
|---|---|---|
| `using-quality-gates` | Unified Python (ruff+mypy) + TypeScript (TS+ESLint+Prettier) checks | `PostToolUse` (Write/Edit/MultiEdit) |
| `tdd-guard` | Test-first behavior before implementation, covering Serena edits | `SessionStart`, `PreToolUse`, `UserPromptSubmit` |
| `service-skills-set` | Service-aware operational context and drift checks (Trinity) | `SessionStart`, `PreToolUse`, `PostToolUse` |
| `using-xtrm` | The fundamental operating manual for xtrm sessions | `SessionStart` |

*Note: As of v2.1.20, legacy single-language quality gates (`py-quality-gate`, `ts-quality-gate`) were consolidated into `using-quality-gates`. `main-guard` is now managed globally as a canonical hook.*

## When To Use Which Skill

- **New Projects**: run `xtrm project init` (analyzes gitnexus, adds MCP, init bd).
- **Backend/Frontend apps**: add `using-quality-gates`.
- **Strict test-first discipline**: add `tdd-guard`.
- **Multi-service Docker project**: add `service-skills-set`.
- **New developers on boarding**: `using-xtrm` (loads automatically).

`xtrm install project all` is appropriate when the repository contains mixed stacks and you want full guardrails.

## Requirements Per Skill

- `using-quality-gates`: Python runtime with `ruff`/`mypy` and/or Node toolchain with `eslint`/`prettier`. Strict rules enforced.
- `tdd-guard`: Node 22+ and reporter integration in your test runner.
- `service-skills-set`: Python + git repo + service definitions for meaningful territory mapping.

## Common Failures and Fixes

- **Hook installed but not firing**:
  - Verify matcher includes the tool (`Write|Edit|MultiEdit` or explicit Serena matchers).
  - Verify skill files were copied under project `.claude/`.
- **Hook blocking messages missing/silent**:
  - `xtrm-tools` silences hook stdout to save tokens. Review `.claude/logs/` or `bg_status` instead.
- **Orphaned hooks**:
  - Run `xtrm clean` to remove stale wrappers and old hooks.
- **Unexpected behavior after merge**:
  - Inspect resulting `.claude/settings.json` and resolve overlapping custom hooks.

## Per-Skill References

- `project-skills/using-quality-gates/README.md`
- `project-skills/tdd-guard/README.md`
- `project-skills/service-skills-set/README.md`
- `project-skills/using-xtrm/SKILL.md`

## Related Docs

- Root overview: `README.md`
- Global skills: `skills.md`
- Global hooks: `hooks.md`
