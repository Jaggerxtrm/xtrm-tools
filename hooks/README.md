# Hooks

Claude Code hooks that extend agent behavior with automated checks, suggestions, and workflow enhancements.

## Overview

Hooks intercept specific events in the Claude Code lifecycle to provide:
- Proactive skill suggestions
- Safety guardrails (venv enforcement, type checking)
- Workflow reminders
- Status information

## Skill-Associated Hooks

### skill-suggestion.py

**Purpose**: Proactively suggests `/prompt-improving` or `/delegating` based on prompt analysis.

**Trigger**: UserPromptSubmit

**Skills**: 
- `prompt-improving` - Suggested for short/generic prompts
- `delegating` - Suggested for simple tasks or explicit delegation requests

**Configuration**:
```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "/home/user/.claude/hooks/skill-suggestion.py",
        "timeout": 5000  // Claude: seconds (5000s), Gemini: milliseconds (5s)
      }]
    }]
  },
  "skillSuggestions": {
    "enabled": true
  }
}
```

### skill-discovery.py

**Purpose**: Scans the `@skills/` directory for `SKILL.md` files and injects a summarized list of all available local skills into the agent's context at the start of a session.

**Trigger**: SessionStart

**Skills**: All skills found in the repository's `skills/` directory.

**Configuration**:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "/home/user/.claude/hooks/skill-discovery.py",
        "timeout": 5000
      }]
    }]
  }
}
```

### serena-workflow-reminder.py

**Purpose**: Enforces semantic workflow using "Using Serena LSP".

**Triggers**: 
- `SessionStart`: Injects skill context.
- `PreToolUse` (Read|Edit): Blocks inefficient usage.

**Skill**: `using-serena-lsp`

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

## Standalone Hooks

### pip-venv-guard.py

**Purpose**: Prevents accidental `pip install` outside virtual environments.

**Trigger**: PreToolUse (Bash)

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "/home/user/.claude/hooks/pip-venv-guard.py",
        "timeout": 3000  // 3 seconds in milliseconds (both Claude & Gemini)
      }]
    }]
  }
}
```

### type-safety-enforcement.py

**Purpose**: Enforces type safety checks in Python code before execution.

**Trigger**: PreToolUse (Bash, Edit, Write)

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "/home/user/.claude/hooks/type-safety-enforcement.py",
        "timeout": 10000  // 10 seconds in milliseconds (both Claude & Gemini)
      }]
    }]
  }
}
```

### statusline.js

**Purpose**: Displays custom status line information.
**Trigger**: StatusLine

## Workflow Enforcement Hooks (JavaScript)

Installed globally to `~/.claude/hooks/` by `xtrm install`. Require Node.js.

### main-guard.mjs

**Purpose**: Blocks direct file edits and dangerous git operations on protected branches (`main`/`master`). Enforces the feature-branch → PR workflow.

**Trigger**: PreToolUse (`Edit|Write|MultiEdit|NotebookEdit|Bash`)

**Blocks**:
- Write/Edit/MultiEdit/NotebookEdit on protected branches
- `git commit` directly on protected branches
- `git push` to protected branches

**Configuration** (global Claude config):
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash",
      "hooks": [{ "type": "command", "command": "node \"~/.claude/hooks/main-guard.mjs\"", "timeout": 5000 }]
    }]
  }
}
```

---

### beads-gate-utils.mjs

**Purpose**: Shared utility module imported by all beads gate hooks. Not registered as a hook itself.

**Exports**: `resolveCwd`, `isBeadsProject`, `getSessionClaim`, `getTotalWork`, `getInProgress`, `clearSessionClaim`, `withSafeBdContext`

**Requires**: `bd` (beads CLI), `dolt`

---

### beads-edit-gate.mjs

**Purpose**: Blocks file edits when the current session has not claimed a beads issue via `bd kv`. Prevents free-riding in multi-agent and multi-session scenarios.

**Trigger**: PreToolUse (`Edit|Write|MultiEdit|NotebookEdit|mcp__serena__*`)

**Behavior**:
- Session has claim (`bd kv get "claimed:<session_id>"`) → allow
- No claim + no trackable work → allow (clean-start state)
- No claim + open/in_progress issues exist → block
- Falls back to global in_progress check when `session_id` is absent

**Requires**: `bd`, `dolt`

---

### beads-commit-gate.mjs

**Purpose**: Blocks `git commit` when the current session still has an unclosed beads claim.

**Trigger**: PreToolUse (`Bash`) — only fires when command matches `git commit`

**Requires**: `bd`, `dolt`

---

### beads-stop-gate.mjs

**Purpose**: Blocks the agent from stopping when the current session has an unclosed beads claim.

**Trigger**: Stop

**Requires**: `bd`, `dolt`

---

### beads-close-memory-prompt.mjs

**Purpose**: After `bd close`, clears the session's kv claim and injects a reminder to capture knowledge before moving on.

**Trigger**: PostToolUse (`Bash`) — only fires when command matches `bd close`

**Requires**: `bd`, `dolt`

---

## Beads claim workflow

```bash
# Claim an issue before editing
bd update <id> --status=in_progress
bd kv set "claimed:<session_id>" "<id>"

# Edit files freely
# ...

# Close when done — hook auto-clears the claim
bd close <id>
```

---

## Installation

Use `xtrm install` to deploy all hooks automatically. For manual setup:

1. Copy hooks to the global Claude Code directory:
   ```bash
   cp hooks/*.mjs hooks/*.py ~/.claude/hooks/
   ```

2. Make scripts executable:
   ```bash
   chmod +x ~/.claude/hooks/*.mjs ~/.claude/hooks/*.py
   ```

3. Merge hook entries into `~/.claude/settings.json`.

4. Restart Claude Code.
