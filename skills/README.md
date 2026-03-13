# Skills

Agent skills for Claude Code. Each skill is a `SKILL.md` file (with optional supporting scripts/references) that Claude loads on demand to adopt specialized behavior.

## Skill Discovery

All skills in this directory are automatically discovered by the `hooks/skill-discovery.py` hook at the start of each session. The hook injects a summarized skill catalog so Claude is aware of available tools from the first prompt.

## Adding a New Skill

1. Create a directory: `skills/my-skill/`
2. Add `SKILL.md` with YAML frontmatter:

```yaml
---
name: my-skill
description: What this skill does and when to use it. Keep the first sentence clear — that's what appears in the session catalog.
---
```

3. The skill is automatically discovered on next session start.

---

## Core Skills

### Workflow

| Skill | Description |
|-------|-------------|
| `prompt-improving` | Improves prompts using XML best practices before execution |
| `delegating` | Delegates tasks to cost-optimized agents (CCS, unitAI) |
| `orchestrating-agents` | Multi-model collaboration (collaborative, adversarial, troubleshoot workflows) |
| `documenting` | SSOT documentation with drift detection and INDEX blocks |

### Code Intelligence

| Skill | Description |
|-------|-------------|
| `using-serena-lsp` | Semantic code editing via Serena MCP (75-80% token savings) |
| `gitnexus-exploring` | Architecture understanding via knowledge graph |
| `gitnexus-debugging` | Bug tracing through call chains |
| `gitnexus-impact-analysis` | Blast radius analysis before edits |
| `gitnexus-refactoring` | Safe symbol rename and extract via graph |

### Expert Personas

| Skill | Description |
|-------|-------------|
| `senior-backend` | NodeJS, Go, Python, Postgres, GraphQL, REST APIs |
| `senior-devops` | CI/CD, containers, AWS/GCP/Azure, infrastructure |
| `senior-security` | AppSec, pen testing, compliance, security architecture |
| `senior-data-scientist` | Statistics, ML, experimentation, causal inference |
| `docker-expert` | Multi-stage builds, image optimization, Compose |
| `db-expert` | SQL optimization, migrations, schema health |
| `python-testing` | pytest, TDD, fixtures, mocking, coverage |
| `clean-code` | Concise, pragmatic coding standards |

### Tooling

| Skill | Description |
|-------|-------------|
| `skill-creator` | Create and iterate on new skills |
| `find-skills` | Help users discover available skills |
| `obsidian-cli` | Interact with Obsidian vaults |

### Service Skills (Trinity)

| Skill | Description |
|-------|-------------|
| `creating-service-skills` | Scaffold expert personas for Docker services |
| `scoping-service-skills` | Map tasks to registered service experts |
| `updating-service-skills` | Detect drift and sync expert documentation |
| `using-service-skills` | Discover and activate registered service experts |

### Project Skill Companions

| Skill | Description |
|-------|-------------|
| `using-main-guard` | Branch protection workflow guide |
| `using-tdd-guard` | TDD Guard enrollment and troubleshooting |
| `using-ts-quality-gate` | TypeScript quality gate configuration |
| `using-py-quality-gate` | Python quality gate configuration |

---

## Skill Structure

```
skills/my-skill/
├── SKILL.md          # Required — frontmatter + instructions
├── scripts/          # Optional — executable helpers
└── references/       # Optional — reference docs loaded on demand
```

Skills use progressive disclosure:
- **Metadata** (`name` + `description`) — always in context (~100 tokens)
- **SKILL.md body** — loaded when skill is activated
- **Bundled resources** — read only when explicitly needed
