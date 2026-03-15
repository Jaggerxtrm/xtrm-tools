# Quality Gates

**Unified quality enforcement workflow** for Claude Code. Combines TDD Guard, TypeScript Quality Gate, and Python Quality Gate into a single coherent workflow.

## What It Does

Quality Gates enforces a complete code quality pipeline:

1. **TDD Guard** — Blocks implementation until failing test exists
2. **TypeScript Quality Gate** — Auto-lints, type-checks, formats TS/JS files
3. **Python Quality Gate** — Auto-lints, type-checks, formats Python files

## Installation

```bash
# Install the unified quality gates skill
xtrm install project quality-gates
```

This installs the `using-quality-gates` skill which provides context on how all three gates work together.

## Required Dependencies

### For TypeScript Projects

```bash
# Quality gate tools
npm install --save-dev typescript eslint prettier

# TDD Guard reporter (choose your test framework)
npm install --save-dev tdd-guard-vitest    # Vitest
npm install --save-dev tdd-guard-jest     # Jest
```

### For Python Projects

```bash
# Quality gate tools
pip install ruff mypy

# TDD Guard reporter
pip install tdd-guard-pytest
```

### Global TDD Guard CLI

```bash
npm install -g tdd-guard
```

## How It Works

### 1. TDD Guard (PreToolUse Hook)

When you attempt to write implementation code:
- Hook intercepts the Write/Edit tool call
- Checks if a failing test exists (via test reporter JSON)
- **No failing test** → BLOCKS with guidance
- **Failing test exists** → Allows implementation

### 2. Quality Gate (PostToolUse Hook)

After every file edit:
- Hook fires automatically
- Runs language-specific checks (TS/ESLint/Prettier or Ruff/Mypy)
- Auto-fixes issues when possible
- **Exit code 2** → BLOCKS, Claude must fix remaining issues
- **Exit code 0** → Success, continues

## Configuration

### TypeScript Quality Gate

Configure via `.claude/hooks/hook-config.json`:

```json
{
  "typescript": {
    "enabled": true,
    "showDependencyErrors": false
  },
  "eslint": {
    "enabled": true,
    "autofix": true
  },
  "prettier": {
    "enabled": true,
    "autofix": true
  },
  "general": {
    "autofixSilent": true
  }
}
```

### Python Quality Gate

Configure via environment variables:

```bash
export CLAUDE_HOOKS_RUFF_ENABLED=true
export CLAUDE_HOOKS_MYPY_ENABLED=true
export CLAUDE_HOOKS_AUTOFIX=true
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | Fatal error (missing dependencies, hook crashed) |
| 2 | Blocking errors found (Claude must fix) |

## Troubleshooting

**"TDD Guard: No failing test found"**
- Write a test that fails first
- Ensure test reporter is installed and configured
- Check test reporter JSON output path

**"ESLint not found" / "Prettier not found"**
- Install: `npm install --save-dev eslint prettier`
- Or disable in `hook-config.json`

**"Ruff not found" / "Mypy not found"**
- Install: `pip install ruff mypy`
- Or set `CLAUDE_HOOKS_RUFF_ENABLED=false`

## Legacy Skills

This unified skill replaces three separate skills:
- `using-tdd-guard` — TDD enforcement only
- `using-ts-quality-gate` — TypeScript linting only
- `using-py-quality-gate` — Python linting only

New projects should install `quality-gates` instead of the individual skills.

## See Also

- Full TDD Guard documentation: https://github.com/nizos/tdd-guard
- TypeScript hooks reference: https://github.com/bartolli/claude-code-typescript-hooks
