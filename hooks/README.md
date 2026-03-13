# Hooks

Claude Code hooks that extend agent behavior with automated checks, suggestions, and workflow enhancements.

## Overview

Hooks intercept specific events in the Claude Code lifecycle to provide:
- Proactive skill suggestions
- Safety guardrails (venv enforcement, type checking)
- Workflow reminders
- Knowledge graph enrichment

All hooks are installed to `~/.claude/hooks/` by `xtrm install`.

---

## Skill-Associated Hooks

### skill-suggestion.py

**Purpose**: Proactively suggests `/prompt-improving` or `/delegating` based on prompt analysis.

**Trigger**: UserPromptSubmit

**Skills**:
- `prompt-improving` — suggested for short/generic prompts
- `delegating` — suggested for simple tasks or explicit delegation requests

**Configuration**:
```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "/home/user/.claude/hooks/skill-suggestion.py",
        "timeout": 5
      }]
    }]
  },
  "skillSuggestions": {
    "enabled": true
  }
}
```

---

### skill-discovery.py

**Purpose**: Scans the `skills/` directory for `SKILL.md` files and injects a summarized skill catalog into context at session start.

**Trigger**: SessionStart

**Configuration**:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "/home/user/.claude/hooks/skill-discovery.py"
      }]
    }]
  }
}
```

---

### serena-workflow-reminder.py

**Purpose**: Enforces semantic code workflow using "Using Serena LSP" — reminds Claude to use symbol-level tools instead of raw file reads.

**Triggers**:
- `SessionStart` — injects skill context
- `PreToolUse` (Read|Edit) — blocks inefficient usage

**Configuration**:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{ "type": "command", "command": "/home/user/.claude/hooks/serena-workflow-reminder.py" }]
    }],
    "PreToolUse": [{
      "matcher": "Read|Edit",
      "hooks": [{ "type": "command", "command": "/home/user/.claude/hooks/serena-workflow-reminder.py" }]
    }]
  }
}
```

---

### gitnexus/gitnexus-hook.cjs

**Purpose**: Enriches tool calls with knowledge graph context. When Claude runs Grep, Glob, or Bash commands, the hook injects related symbols, callers, and execution flows from the GitNexus graph.

**Trigger**: PreToolUse (Grep|Glob|Bash)

**Skills**: `gitnexus/exploring`, `gitnexus/debugging`, `gitnexus/impact-analysis`, `gitnexus/refactoring`

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Grep|Glob|Bash",
      "hooks": [{
        "type": "command",
        "command": "node /home/user/.claude/hooks/gitnexus/gitnexus-hook.cjs",
        "timeout": 10
      }]
    }]
  }
}
```

**Prerequisite**: `npm install -g gitnexus` and `npx gitnexus analyze` run in the project root.

---

## Standalone Hooks

### type-safety-enforcement.py

**Purpose**: Enforces type safety checks in Python code before execution.

**Trigger**: PreToolUse (Bash|Edit|Write)

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "/home/user/.claude/hooks/type-safety-enforcement.py",
        "timeout": 10
      }]
    }]
  }
}
```

---

## Note on Project Skill Hooks

The following hooks are installed per-project via `xtrm install project <skill>`, not globally:

| Hook | Project Skill | Purpose |
|------|--------------|---------|
| `main-guard.cjs` | `main-guard` | Blocks edits and dangerous git ops on protected branches |
| `quality-check.cjs` | `ts-quality-gate` | TypeScript/ESLint/Prettier quality gate |
| `quality-check.py` | `py-quality-gate` | Python ruff/mypy quality gate |
| `tdd-guard` (npm) | `tdd-guard` | Blocks implementation without failing test |

See [project-skills/README.md](../project-skills/README.md) for details.

---

## Installation

Hooks are installed automatically by `xtrm install`. For manual setup:

```bash
cp hooks/* ~/.claude/hooks/
cp -r hooks/gitnexus ~/.claude/hooks/
chmod +x ~/.claude/hooks/*.py
```

Then configure each hook in `~/.claude/settings.json`.
