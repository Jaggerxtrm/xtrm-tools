---
name: using-quality-gates
description: 'Quality Gates workflow for Claude Code. Use when editing code in projects with quality enforcement. Covers the full cycle: TDD guard (write failing test first) → implement → auto-lint/typecheck. Activates on code edits, quality issues, or when user asks about testing/linting workflow.'
---

# Using Quality Gates

**Quality Gates** enforces a complete code quality workflow in Claude Code. It coordinates three enforcement layers:

1. **TDD Guard** (PreToolUse) — Blocks implementation until failing test exists
2. **TypeScript Quality Gate** (PostToolUse) — Auto-lints, type-checks, formats TS/JS
3. **Python Quality Gate** (PostToolUse) — Auto-lints, type-checks, formats Python

## The Quality Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER REQUEST: "Add feature X"                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. TDD GUARD (PreToolUse)                                      │
│     - Intercepts Write/Edit attempts                            │
│     - Checks: Is there a failing test?                          │
│     - NO → BLOCK with guidance: "Write a failing test first"    │
│     - YES → Allow implementation                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. IMPLEMENT (Write/Edit tool succeeds)                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. QUALITY GATE (PostToolUse)                                  │
│     - TypeScript projects: ts-quality-gate fires                │
│       • TypeScript compilation check                            │
│       • ESLint validation + auto-fix                            │
│       • Prettier formatting + auto-fix                          │
│     - Python projects: py-quality-gate fires                    │
│       • Ruff linting + auto-fix                                 │
│       • Ruff formatting + auto-fix                              │
│       • Mypy type checking                                      │
│     - Exit code 2 → BLOCK, Claude must fix issues               │
│     - Exit code 0 → Success, continue                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. COMMIT (bd commit + git push)                               │
└─────────────────────────────────────────────────────────────────┘
```

## When This Skill Activates

**Triggers:**
- You attempt to write/edit code files
- Quality gate reports errors (linting, types, formatting)
- User asks about testing, linting, or quality workflow
- Session starts in a project with quality gates installed

**Does NOT trigger:**
- Documentation edits (.md, .txt files)
- Configuration files (unless they contain code)
- Projects without quality gates installed

## Response Modes

Adjust your response based on the context:

**Full Workflow Mode** — Use when:
- User explicitly mentions tests, TDD, linting, or quality gates
- User is blocked by TDD Guard ("No failing test found")
- User is blocked by quality gate errors (type/lint issues)
- Feature work or refactoring in an established codebase

Provide the complete workflow: test-first reasoning, implementation guidance, quality gate validation steps.

**Minimal Mode** — Use when:
- General coding tasks ("write a script to X", "create a utility that Y")
- One-off scripts without existing test infrastructure
- User doesn't mention quality/testing context

Response pattern:
1. Complete the task directly
2. Brief note at the end: "Consider adding tests for this. If you have TDD Guard installed, write a failing test first."
3. Don't explain the full quality gate workflow unless asked

**Why this matters:** Over-explaining TDD for simple scripts creates friction. Match the response depth to the task complexity.

## How Each Gate Works

### TDD Guard (PreToolUse)

**Purpose:** Enforce test-driven development

**Intercepts:** `Write`, `Edit`, `MultiEdit`, `TodoWrite`, Serena edit tools

**Behavior:**
1. Checks test reporter JSON for failing tests
2. If NO failing test → blocks with message:
   ```
   TDD Guard: No failing test found.
   Write a test that fails first, then implement.
   ```
3. If failing test exists → allows the edit

**Test Reporters Required:**
| Language | Package | Setup |
|----------|---------|-------|
| TypeScript (Vitest) | `tdd-guard-vitest` | Add to `vitest.config.ts` |
| TypeScript (Jest) | `tdd-guard-jest` | Add to `jest.config.ts` |
| Python (pytest) | `tdd-guard-pytest` | Add to `conftest.py` |
| PHP (PHPUnit) | `tdd-guard-phpunit` | Add to `phpunit.xml` |
| Go | `tdd-guard-go` | Pipe `go test -json` output |
| Rust | `tdd-guard-rust` | Pipe `cargo nextest` output |

### TypeScript Quality Gate (PostToolUse)

**Purpose:** Enforce TypeScript, ESLint, Prettier standards

**Runs after:** Every TS/JS file edit

**Checks:**
1. TypeScript compilation (type errors)
2. ESLint validation (style, best practices)
3. Prettier formatting (consistency)

**Auto-fix:** Enabled by default for ESLint and Prettier

**Configuration** (`.claude/hooks/hook-config.json`):
```json
{
  "typescript": { "enabled": true, "showDependencyErrors": false },
  "eslint": { "enabled": true, "autofix": true },
  "prettier": { "enabled": true, "autofix": true },
  "general": { "autofixSilent": true }
}
```

**Exit Codes:**
- `0` — All checks passed
- `1` — Fatal error (missing dependencies)
- `2` — Blocking errors (Claude must fix)

### Python Quality Gate (PostToolUse)

**Purpose:** Enforce Python code quality

**Runs after:** Every Python file edit

**Checks:**
1. Ruff linting (errors, style, best practices)
2. Ruff formatting (Black-compatible)
3. Mypy type checking (static types)

**Auto-fix:** Enabled for Ruff lint/format

**Configuration** (environment variables):
```bash
CLAUDE_HOOKS_RUFF_ENABLED=true
CLAUDE_HOOKS_MYPY_ENABLED=true
CLAUDE_HOOKS_AUTOFIX=true
```

**Exit Codes:**
- `0` — All checks passed
- `1` — Fatal error
- `2` — Blocking errors (Claude must fix)

## Handling Quality Gate Errors

When a quality gate blocks with exit code 2:

1. **Read the error output** — It shows specific issues
2. **Apply auto-fix if available** — ESLint/Prettier/Ruff can auto-fix many issues
3. **Manually fix remaining issues** — Type errors, complex lint violations
4. **Re-run the gate** — Usually fires automatically on next edit

**Example error flow:**
```
[ERROR] TypeScript compilation failed:
  src/auth.ts:42:5 - error TS2322: Type 'string' is not assignable to type 'number'

[ERROR] ESLint found 2 issues:
  src/auth.ts:15:10 - 'unusedVar' is defined but never used
  src/auth.ts:28:3 - Missing return type

[WARN] Auto-fix applied: 1 issue fixed
[BLOCK] 3 issues remain - fix before continuing
```

## Partial Installs

Not all projects have all three gates. The workflow adapts:

| Project Type | Active Gates |
|--------------|--------------|
| TypeScript + tests | TDD Guard + TS Quality Gate |
| Python + tests | TDD Guard + PY Quality Gate |
| TypeScript only | TS Quality Gate only |
| Python only | PY Quality Gate only |
| Tests only | TDD Guard only |

The skill detects which gates are installed and adjusts guidance accordingly.

## Troubleshooting

**"TDD Guard: No failing test found"**
- Write a test that fails first
- Verify test reporter is installed and configured
- Run tests manually to confirm reporter JSON is generated

**"ESLint not found" / "Prettier not found"**
- Install: `npm install --save-dev eslint prettier`
- Or disable in `hook-config.json`

**"Ruff not found" / "Mypy not found"**
- Install: `pip install ruff mypy`
- Or set `CLAUDE_HOOKS_RUFF_ENABLED=false`

**Hook not running**
- Verify hooks in `.claude/settings.json`
- Check hook script paths are correct

## Installation

```bash
# Install quality gates project skill
xtrm install project quality-gates

# For TypeScript projects
npm install --save-dev typescript eslint prettier

# For Python projects
pip install ruff mypy

# For TDD Guard (choose your test framework)
npm install --save-dev tdd-guard-vitest    # Vitest
npm install --save-dev tdd-guard-jest     # Jest
pip install tdd-guard-pytest              # pytest
```

See `.claude/docs/quality-gates-readme.md` for full setup instructions.

## Related Skills

- **using-tdd-guard** — TDD enforcement only (legacy, kept for partial installs)
- **using-ts-quality-gate** — TypeScript linting only (legacy)
- **using-py-quality-gate** — Python linting only (legacy)

**Note:** `using-quality-gates` unifies all three. New projects should install this single skill.
