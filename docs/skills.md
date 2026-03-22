---
title: Skills Catalog
scope: skills
category: overview
version: 1.2.0
updated: 2026-03-22
description: "Global skills installed into the xtrm-managed agent environments"
source_of_truth_for:
  - "skills/**/SKILL.md"
domain: [skills, claude, pi]
---

# Skills Module

`skills/` contains reusable global capabilities synced by `xtrm install`.

## Runtime Model

1. Run `xtrm install` to sync skills.
2. `using-xtrm` context is injected at session start (Claude hook path).
3. Skills are selected by intent or explicit invocation.

## Core Skills

| Skill | Primary Use |
|---|---|
| `using-xtrm` | Session operating manual |
| `documenting` | SSOT documentation + drift workflow |
| `delegating` | Delegation routing and model strategy |
| `orchestrating-agents` | Multi-agent collaboration patterns |

## Additional Skills

Includes GitNexus, testing, security, backend/devops, Obsidian, prompt optimization, and skill authoring helpers.

## Operational Commands

```bash
xtrm install
xtrm status
xtrm clean
```

## Related Docs

- [XTRM-GUIDE.md](XTRM-GUIDE.md)
- [hooks.md](hooks.md)
- [project-skills.md](project-skills.md)
