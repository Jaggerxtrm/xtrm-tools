---
title: Production Live Testing Checklist
scope: testing
category: guide
version: 1.2.0
updated: 2026-03-20
description: "Checklist for validating active hooks/extensions workflow"
domain: [testing, hooks, pi, quality-gates]
---

# Production Live Testing Checklist

## Core Checks

- [ ] `xtrm --version` works
- [ ] `node scripts/compile-policies.mjs --check` passes
- [ ] `node scripts/compile-policies.mjs --check-pi` passes
- [ ] `bd` and `dolt` available in environment

## Beads Gate Checks

- [ ] In `.beads` repo with open work and no claim: edit is blocked
- [ ] After `bd update <id> --claim`: edit is allowed
- [ ] `git commit` with unresolved claimed work is blocked
- [ ] After `bd close <id> --reason "..."`: close succeeds

## Pi Session-Flow Checks

- [ ] `bd close <id> --reason "..."` triggers close-based auto-commit attempt
- [ ] If no changes exist, auto-commit is skipped cleanly
- [ ] Session flow does not force `xtrm finish` orchestration guidance

## Pi Memory-Gate Hard Enforcement Checks

- [ ] After successful close, memory reminder includes `touch .beads/.memory-gate-done`
- [ ] While pending memory gate, mutating tool call is blocked
- [ ] While pending memory gate, `session_before_switch` is canceled
- [ ] While pending memory gate, `session_before_fork` is canceled
- [ ] While pending memory gate, `session_before_compact` is canceled
- [ ] After touching marker, claim + closed-this-session keys are cleared

## Quality Gate Checks

- [ ] Post-edit quality checks run for Python/TypeScript as configured
- [ ] Serena edit operations trigger equivalent post-edit quality behavior
- [ ] Invalid TS syntax must fail gate (tracked bug: `jaggers-agent-tools-ycg9`)

## Failure Template

- Component:
- Command/tool invoked:
- Expected:
- Actual:
- Repro steps:
- Proposed fix: