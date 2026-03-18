# Delegating Skill Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the `delegating` skill proactively trigger, work correctly with CCS inside Claude Code sessions, and align with Anthropic's skill authoring best practices.

**Architecture:** Three-layer fix: (1) skill description + content quality, (2) CCS execution via `env -u CLAUDECODE` workaround, (3) `skill-suggestion.py` hook expansion to cover orchestration patterns and surface the right backend based on `$CLAUDECODE` detection.

**Tech Stack:** Markdown (SKILL.md), Python (hook), YAML (config.yaml)

---

## Context

- **Source of truth for skill:** `skills/delegating/SKILL.md` in the project (syncs to `~/.claude/skills/delegating/SKILL.md`)
- **Hook already exists:** `hooks/skill-suggestion.py` registered as `UserPromptSubmit` — already fires, already has CCS patterns
- **CCS workaround confirmed working:** `env -u CLAUDECODE ccs {profile} -p "{task}"` — no crash, GLM-4.7 responds
- **No commands to fix:** user deleted all `.ccs` commands
- **`ccs-delegation` skill:** lives in `~/.ccs/.claude/skills/ccs-delegation/` — used by CCS subprocess context, not by outer session

---

## Task 1: Rewrite `delegating` skill description

**File:**
- Modify: `skills/delegating/SKILL.md` (lines 1–18, frontmatter)

**What to change:**

Replace current frontmatter:
```yaml
---
name: delegating
description: >-
  Delegate tasks to cost-optimized models (CCS) or multi-agent orchestration (Gemini/Qwen).
  Use when the user asks to "delegate" a task, or for simple deterministic tasks (typos, tests),
  complex code reviews, or large-scale refactoring that can be offloaded.
gemini-command: delegate
gemini-prompt: |
  1. Analyze the task for keywords:
     - simple tasks (typo, test, doc, format) -> CCS
     - complex tasks (review, implement feature, debug) -> Orchestration (Gemini/Qwen)
  2. If ambiguous, use ask_user to confirm the execution path (Delegate vs Main Session).
  3. Execute via the optimal backend and report results including backend type and cost indicator.
version: 7.0.0
---
```

With:
```yaml
---
name: delegating
description: >-
  Proactively delegates tasks to cost-optimized agents before working in main session.
  MUST suggest for: tests, typos, formatting, docs, refactors, code reviews, feature
  implementation, debugging, commit validation. Skips main session token usage by routing
  to GLM (simple/deterministic), Gemini (reasoning/analysis), Qwen (quality/patterns),
  or multi-agent orchestration (review, feature dev, bug hunt). Never suggest for:
  architecture decisions, security-critical code, unknown-cause bugs, performance optimization.
allowed-tools: Bash
---
```

**Why:** `version`, `gemini-command`, `gemini-prompt` are not official Claude Code frontmatter fields — they have no effect and add noise. The new description includes action keywords (`tests`, `typos`, `refactors`, `code reviews`, `debugging`) so auto-discovery fires on user requests. `MUST suggest` forces proactive behavior. `allowed-tools: Bash` scopes execution.

**Step 1:** Edit `skills/delegating/SKILL.md` — replace frontmatter block (lines 1–18) with new content above.

**Step 2:** Verify file parses cleanly:
```bash
python3 -c "
import re
text = open('skills/delegating/SKILL.md').read()
fm = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
print('Frontmatter OK' if fm else 'MISSING FRONTMATTER')
print(len(fm.group(1).split('\n')), 'lines')
"
```
Expected: `Frontmatter OK` and line count < 15.

**Step 3:** Commit:
```bash
git add skills/delegating/SKILL.md
git commit -m "fix(delegating): rewrite description for proactive auto-discovery"
```

---

## Task 2: Fix SKILL.md — AskUserQuestion pseudocode → prose

**File:**
- Modify: `skills/delegating/SKILL.md` (Interactive Menu section)

**Problem:** The skill uses TypeScript `ask_user({...})` pseudocode. This is not a real tool. The real tool is `AskUserQuestion`. Claude may try to parse the pseudocode as instructions, creating confusion.

**What to change:** Replace both `ask_user()` code blocks in the `## Interactive Menu` section with direct prose instructions. Replace:

```typescript
ask_user({
  questions: [{
    question: "This task can be delegated...",
    ...
  }]
});
```

With:
```markdown
Use AskUserQuestion with:
- question: "This task can be delegated. How would you like to proceed?"
- header: "Execution"
- options:
  - "Delegate (Recommended)" — Execute via optimal backend. Saves main session tokens.
  - "Work in main session" — Execute here. Better for tasks needing discussion or complex context.
```

Same for Step 2 profile selection block — replace TypeScript with prose.

**Step 1:** Edit the `## Interactive Menu` section in `skills/delegating/SKILL.md` — replace both `ask_user()` code blocks with prose as shown above.

**Step 2:** Verify no `ask_user` or `AskUserQuestion({` strings remain (they should only be in prose form now):
```bash
grep -n "ask_user\|AskUserQuestion({" skills/delegating/SKILL.md
```
Expected: no output.

**Step 3:** Commit:
```bash
git add skills/delegating/SKILL.md
git commit -m "fix(delegating): replace TypeScript pseudocode with prose AskUserQuestion instructions"
```

---

## Task 3: Fix CCS execution — add `env -u CLAUDECODE`

**File:**
- Modify: `skills/delegating/SKILL.md` (Execution Flow section)

**Problem:** `ccs {profile} -p "{task}"` fails inside Claude Code sessions because `$CLAUDECODE` env var is set, triggering the nested session guard. Confirmed fix: `env -u CLAUDECODE ccs {profile} -p "{task}"` works correctly (tested: GLM-4.7 responded, exit 0, parent session unaffected).

**What to change:** In the `## Execution Flow` section, find all occurrences of the CCS execution command pattern and update:

```
# Before
ccs {profile} -p "{task}"

# After
env -u CLAUDECODE ccs {profile} -p "{task}"
```

Also update the Examples section wherever raw `ccs` calls appear.

**Step 1:** Edit `skills/delegating/SKILL.md` — replace all `ccs {profile} -p` with `env -u CLAUDECODE ccs {profile} -p`.

**Step 2:** Verify all occurrences updated:
```bash
grep -n "^\s*ccs " skills/delegating/SKILL.md
```
Expected: no bare `ccs` calls (only `env -u CLAUDECODE ccs` or comments).

**Step 3:** Commit:
```bash
git add skills/delegating/SKILL.md
git commit -m "fix(delegating): use env -u CLAUDECODE for CCS to allow nested execution"
```

---

## Task 4: Update `skill-suggestion.py` — add orchestration patterns + CLAUDECODE detection

**File:**
- Modify: `hooks/skill-suggestion.py`

**Problems:**
1. Hook has no orchestration patterns (review, implement feature, debug) — only fires for simple CCS tasks
2. Hook doesn't detect `$CLAUDECODE` — suggestion always says "use CCS" even when CCS is blocked

**Step 1:** Add orchestration patterns after the `CCS_PATTERNS` block:

```python
ORCHESTRATION_PATTERNS = [
    r"review.*(code|security|quality)|code.*(review|audit)",
    r"security.*(audit|review|scan)",
    r"implement.*(feature|endpoint|api)|build.*feature",
    r"(debug|investigate|root.*cause|crash|fix.*unknown)",
    r"(refactor.*sprint|major.*refactor|migration|technical.*debt)",
    r"validate.*(commit|staged)|pre.*commit",
]
```

**Step 2:** Add `$CLAUDECODE` detection helper at top of try block:

```python
ccs_available = not bool(os.environ.get('CLAUDECODE'))
ccs_hint = "CCS backend" if ccs_available else "Gemini or Qwen directly (CCS unavailable inside Claude Code)"
```

**Step 3:** Update the CCS suggestion message to use `ccs_hint`:

```python
# Before
ctx.allow(system_message=f"💡 {agent_name} Internal Reminder: This appears to be a simple, deterministic task (typo/test/format/doc). Consider using the /delegating skill (CCS backend) for cost-optimized execution.")

# After
ctx.allow(system_message=f"💡 {agent_name} Internal Reminder: This appears to be a simple, deterministic task (typo/test/format/doc). Consider using the /delegating skill ({ccs_hint}) for cost-optimized execution.")
```

**Step 4:** Add orchestration check after the CCS check block:

```python
# 4. Check Orchestration (Complex Tasks)
elif matches(prompt, ORCHESTRATION_PATTERNS) and not matches(prompt, EXCLUDE_PATTERNS):
    ctx.allow(system_message=f"💡 {agent_name} Internal Reminder: This looks like a multi-agent task (review/implement/debug). Consider using the /delegating skill (Gemini+Qwen orchestration) instead of handling in main session.")
```

**Step 5:** Test the hook manually:
```bash
# Test CCS pattern (should fire)
echo '{"prompt": "add unit tests for UserService", "agent_type": "claude"}' | python3 hooks/skill-suggestion.py
echo "exit: $?"

# Test orchestration pattern (should fire)
echo '{"prompt": "review this code for security issues", "agent_type": "claude"}' | python3 hooks/skill-suggestion.py
echo "exit: $?"

# Test exclusion (should NOT fire a delegation hint)
echo '{"prompt": "implement OAuth authentication", "agent_type": "claude"}' | python3 hooks/skill-suggestion.py
echo "exit: $?"

# Test conversational (should pass through silently)
echo '{"prompt": "hello", "agent_type": "claude"}' | python3 hooks/skill-suggestion.py
echo "exit: $?"
```
Expected: all exit 0; check for `system_message` presence/absence in stdout.

**Step 6:** Commit:
```bash
git add hooks/skill-suggestion.py
git commit -m "feat(hooks): add orchestration patterns + CLAUDECODE detection to skill-suggestion"
```

---

## Task 5: Sync to `~/.claude/` and verify end-to-end

**Step 1:** Run the CLI sync to push changes to the user's home directory:
```bash
# Check what sync command is available
npm run --prefix cli/ -- sync 2>/dev/null || node cli/index.js sync 2>/dev/null || echo "check sync command"
```

If no sync command, copy manually:
```bash
cp skills/delegating/SKILL.md ~/.claude/skills/delegating/SKILL.md
cp hooks/skill-suggestion.py ~/.claude/hooks/skill-suggestion.py
```

**Step 2:** Verify installed files match source:
```bash
diff skills/delegating/SKILL.md ~/.claude/skills/delegating/SKILL.md && echo "OK"
diff hooks/skill-suggestion.py ~/.claude/hooks/skill-suggestion.py && echo "OK"
```

**Step 3:** Live test — in Claude Code, type: `add unit tests for the auth module`
- Expected: hook fires, system message appears suggesting `/delegating`
- Expected: if `/delegating` invoked, it uses `env -u CLAUDECODE ccs glm -p "..."` and succeeds

**Step 4:** Final commit if any sync artifacts changed:
```bash
git add -A && git status  # review what changed
git commit -m "chore: sync delegating skill hardening to installation"
```

---

## Summary of changes

| File | Change |
|------|--------|
| `skills/delegating/SKILL.md` | Description rewrite, pseudocode → prose, `env -u CLAUDECODE` in execution, remove unsupported frontmatter fields |
| `hooks/skill-suggestion.py` | Add orchestration patterns, add `$CLAUDECODE` detection for correct backend hint |

**What this does NOT change:**
- `~/.ccs/.claude/skills/ccs-delegation/SKILL.md` — runs inside CCS subprocess after `env -u CLAUDECODE` already handled it; no fix needed there
- `config.yaml` — already correct, no changes needed
- `settings.json` hooks registration — already has `skill-suggestion.py` registered for `UserPromptSubmit`
