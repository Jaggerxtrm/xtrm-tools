---
title: Production Live Testing Checklist
scope: testing
category: guide
version: 1.1.0
updated: 2026-03-19
description: "Checklist for validating active hooks/extensions workflow"
domain: [testing, hooks, skills]
---

# Production Live Testing Checklist

## Core Checks

- [ ] `xtrm --version` works
- [ ] `node scripts/compile-policies.mjs --check` passes
- [ ] `bd` and `dolt` available in environment

## Beads Gate Checks

- [ ] In `.beads` repo with open work and no claim: edit is blocked
- [ ] After `bd update <id> --claim`: edit is allowed
- [ ] `git commit` with unresolved claimed work is blocked
- [ ] After `bd close <id> --reason "..."`: close succeeds and memory prompt flow is available

## Pi Session-Flow Checks

- [ ] `bd close <id> --reason "..."` triggers close-based auto-commit attempt
- [ ] If no changes exist, auto-commit is skipped cleanly
- [ ] Session flow does not force `xtrm finish` orchestration guidance

## Quality Gate Checks

- [ ] Post-edit quality checks run for Python/TypeScript as configured
- [ ] Serena edit operations trigger equivalent post-edit quality behavior

## Failure Template

- Component:
- Command/tool invoked:
- Expected:
- Actual:
- Repro steps:
- Proposed fix:
