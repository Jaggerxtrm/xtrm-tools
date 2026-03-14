# Production Live Tools Testing Guide

Use this checklist to validate **all project skills and project hooks** in a real project environment.

## Scope

Project skills covered:
- `py-quality-gate`
- `ts-quality-gate`
- `tdd-guard`
- `service-skills-set`

Serena edit-tool matchers covered:
- `mcp__serena__rename_symbol`
- `mcp__serena__replace_symbol_body`
- `mcp__serena__insert_after_symbol`
- `mcp__serena__insert_before_symbol`

---

## Global Preflight

- [ ] `xtrm --version` returns expected release.
- [ ] `claude --version` is available.
- [ ] `xtrm install` completed successfully for `~/.claude`.
- [ ] Inside target repo: `xtrm project init` runs and ends with `bd init`.

---

## Project Setup

- [ ] In target repo, run:
  - [ ] `xtrm install project py-quality-gate`
  - [ ] `xtrm install project ts-quality-gate`
  - [ ] `xtrm install project tdd-guard`
  - [ ] `xtrm install project service-skills-set`
- [ ] Confirm installed docs exist:
  - [ ] `.claude/docs/py-quality-gate-readme.md`
  - [ ] `.claude/docs/ts-quality-gate-readme.md`
  - [ ] `.claude/docs/tdd-guard-readme.md`
  - [ ] `.claude/docs/service-skills-set-readme.md`

---

## Hook Wiring Verification

- [ ] Open `.claude/settings.json` and verify these hook entries exist:
  - [ ] `PostToolUse` matcher for `py-quality-gate` includes all Serena tool names.
  - [ ] `PostToolUse` matcher for `ts-quality-gate` includes all Serena tool names.
  - [ ] `PreToolUse` matcher for `tdd-guard` includes all Serena tool names.
  - [ ] `PreToolUse` and `PostToolUse` matchers for `service-skills-set` include all Serena tool names.
- [ ] Confirm bridge script exists:
  - [ ] `.claude/hooks/tdd-guard-pretool-bridge.cjs`

---

## Live Skill Tests

### 1) PY Quality Gate

- [ ] Edit a Python file with a clear lint/type issue.
- [ ] Hook runs after edit (`PostToolUse`) and reports issue.
- [ ] Auto-fix applies where possible (`ruff format` / lint autofix).
- [ ] Blocking behavior occurs for unresolved critical issues.
- [ ] Repeat using Serena edit tool (`mcp__serena__replace_symbol_body`) and confirm same behavior.

### 2) TS Quality Gate

- [ ] Edit a TS/JS file with lint/type/format issues.
- [ ] Hook runs after edit (`PostToolUse`) and reports issues.
- [ ] ESLint/Prettier autofix path works when configured.
- [ ] Blocking behavior occurs for unresolved critical issues.
- [ ] Repeat using Serena edit tool (`mcp__serena__insert_after_symbol`) and confirm same behavior.

### 3) TDD Guard

- [ ] PreToolUse gate blocks implementation attempts when tests are not in proper state.
- [ ] `tdd-guard --prompt-check` still works for quick on/off prompts.
- [ ] `tdd-guard --session-init` runs on session start.
- [ ] **Non-code bypass check**: edit a `.md` file and confirm no false TDD block.
- [ ] Code-file check: edit a `.ts`/`.py` file and confirm TDD guard still enforces.
- [ ] Serena edit check: run one of:
  - [ ] `mcp__serena__rename_symbol`
  - [ ] `mcp__serena__replace_symbol_body`
  - [ ] `mcp__serena__insert_after_symbol`
  - [ ] `mcp__serena__insert_before_symbol`
  and confirm TDD behavior is applied to code files.

### 4) Service Skills Set

- [ ] `SessionStart` catalog injection appears for available services.
- [ ] `PreToolUse` activation reminder appears when touching service territory files.
- [ ] `PostToolUse` drift reminder appears after changing service-owned code.
- [ ] Git hooks installed and executable:
  - [ ] `.githooks/pre-commit`
  - [ ] `.githooks/pre-push`
- [ ] Serena edit check: modify service code with Serena tool and confirm activation/drift hooks still trigger.

---

## Main-Guard / Beads Gate (Global Hook Sanity)

- [ ] On protected branch (`main`/`master`), file-edit attempts are blocked.
- [ ] Serena edit tools are treated as edit-equivalent by matcher routing.
- [ ] In `.beads` project without active claim, edit gate blocks as expected.
- [ ] After claim (`bd update <id> --status=in_progress` + kv claim), edit is allowed.

---

## Pass Criteria

- [ ] All four project skills execute their intended hooks.
- [ ] All Serena edit operations above trigger the same hook class as normal edits.
- [ ] No false-positive TDD block on markdown/non-code edits.
- [ ] No missing hook script path errors.
- [ ] Team can reproduce results on a clean machine following this guide.

---

## Failure Logging Template

Use this for any failed check:

- [ ] Skill/hook:
- [ ] Command/tool invoked:
- [ ] Expected:
- [ ] Actual:
- [ ] Transcript path:
- [ ] Proposed fix:
