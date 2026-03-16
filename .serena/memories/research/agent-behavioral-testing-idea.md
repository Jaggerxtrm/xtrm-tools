# Agent Behavioral Testing — Idea / Open Research
> Status: idea partially implemented by continuous-learning-v2 skill
> Date: 2026-03-16
> Related: research/tdd-ai-empirical-2026-03-16 (evals layer)

## Core Idea
Log every agent move (tool calls, file edits, hook outcomes, skills triggered, beads actions),
clean and pass through a second agent into a structured DB, then test the agent itself based
on how it reached conclusions — using that data to correct hooks/skills/code.

## Existing Implementation: continuous-learning-v2 (affaan-m/everything-claude-code)
NOT vaporware — observe.sh IS implemented. The GitHub tree view showed empty dirs but the
files exist (user confirmed). observe.sh is a pure observation collector.

### observe.sh — what it does
- Reads Claude Code hook JSON from stdin (PreToolUse/PostToolUse)
- 5-layer anti-loop guard: cli-only, ECC_HOOK_PROFILE!=minimal, ECC_SKIP_OBSERVE!=1, no agent_id, no skip-path match
- Calls detect-project.sh → derives PROJECT_ID from git remote URL hash (12 chars)
- Writes to ~/.claude/homunculus/projects/<hash>/observations.jsonl
- Scrubs secrets (api_key|token|secret|password|authorization) before persisting
- Signals observer daemon via kill -USR1 <observer.pid> if running
- Does NOT inject anything back into Claude context

### Instinct injection pipeline (full picture)
observe.sh → observations.jsonl → observer daemon (SIGUSR1) → creates instinct .yaml files
                                                                         ↓
                                              NOT automatic — requires /instinct-status
                                              or manual evolution via /evolve → SKILL.md
                                              → loaded by Claude Code as normal skill

Instincts become "automatic" only AFTER being evolved into SKILL.md files, which are then
loaded by Claude Code through the normal skill lifecycle. There is NO hook-level injection.

## What continuous-learning-v2 Does NOT Cover
- **Ground truth labeling**: no human label layer — user corrections are the confidence signal
- **Beads-aware context**: does not integrate with beads gate outcomes
- **Hook-level injection**: injection only via evolved skills, not PreToolUse additionalContext

## xtrm Integration Notes
- interactions.jsonl is EMPTY — nothing writes to it currently
- observe.sh would replace/augment this with actual data capture
- detect-project.sh provides portable project ID via git remote hash
- The 5-layer anti-loop guard is reusable for xtrm hooks

## Connection to TDD Research Brief
This is the "evals" layer (row 5 of the hybrid model table) applied to agent behavior:
evals work when grounded in realistic tasks + corrections, not when agent self-validates.
The confidence scoring uses user corrections as ground truth proxy.
