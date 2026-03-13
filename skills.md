# Skills Module

This document explains how the global `skills/` module works in practice: what gets installed, how skills are discovered, and how to maintain skill quality.

## What This Module Is

`skills/` contains reusable, global capabilities installed to the user-level Claude environment (not tied to one repo).

Use this module when you need:
- reusable workflows across many repositories
- skill-triggered behavior via prompt intent or hooks
- maintainable, versioned agent guidance (`SKILL.md` contracts)

## Runtime Model

1. `xtrm install all` or `xtrm install basic` syncs skill folders to Claude targets.
2. At session start, `hooks/skill-discovery.py` scans installed skills.
3. The agent gets a summarized skill catalog and can activate relevant skills by user intent.
4. Some hooks (for example `skill-suggestion.py`) proactively suggest specific skills.

## Skill Catalog (Current)

| Skill | Primary Use |
|---|---|
| `clean-code` | Coding standards and maintainability choices |
| `delegating` | Route work to external specialist agents |
| `docker-expert` | Dockerfile/compose/container optimization |
| `documenting` | SSOT documentation lifecycle and drift checks |
| `find-skills` | Discover/install missing skills |
| `gitnexus-debugging` | Trace failures through call chains |
| `gitnexus-exploring` | Explore unfamiliar architecture |
| `gitnexus-impact-analysis` | Blast-radius analysis before edits |
| `gitnexus-refactoring` | Safer symbol-level refactors |
| `hook-development` | Build and wire Claude hooks |
| `obsidian-cli` | Obsidian vault operations from CLI |
| `orchestrating-agents` | Multi-agent handoff and review loops |
| `prompt-improving` | Improve prompts into structured specs |
| `python-testing` | Pytest strategy and test architecture |
| `senior-backend` | API/business-logic/backend patterns |
| `senior-data-scientist` | Modeling, experiments, inference |
| `senior-devops` | CI/CD, infra, deployment workflows |
| `senior-security` | AppSec and threat-focused review |
| `skill-creator` | Author and evolve skills systematically |
| `using-TDD` | Test-first coding workflow |
| `using-serena-lsp` | Semantic-edit workflow using Serena |

## Authoring Contract

Each skill directory should contain `SKILL.md` with YAML frontmatter:

```yaml
---
name: my-skill
description: One-sentence trigger description and when to use it.
version: 1.0.0
---
```

Authoring rules:
- keep `description` explicit; it drives discoverability and triggering
- include concrete workflow steps, not only principles
- avoid duplicate responsibility across skills unless intentionally layered

## Operational Commands

```bash
xtrm install basic
xtrm install all
xtrm status
```

Use `xtrm status` after changes to ensure skill files are in sync.

## Troubleshooting

- Skill not appearing in sessions:
  - verify folder contains `SKILL.md`
  - verify frontmatter has `name` and `description`
  - confirm `skill-discovery.py` is installed and wired in Claude settings
- Wrong skill being suggested:
  - tighten the first sentence of `description` to reduce ambiguity
  - check overlap with other skills' trigger language

## Related Docs

- Root overview: `README.md`
- Hooks behavior: `hooks.md`
- Project-local skills: `project-skills.md`
- MCP layer: `mcp.md`

## Verified Completed Issues (2026-03-13)

- `jaggers-agent-tools-cgv`: aligned service-skills guidance with repository skill-creator baseline
- `jaggers-agent-tools-93d`: style pass across remaining service-skills documentation
