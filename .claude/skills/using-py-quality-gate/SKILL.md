---
name: using-py-quality-gate
description: PY Quality Gate enforces Python code quality with ruff (linting/formatting) and mypy (type checking). Runs automatically on every file edit with auto-fix support.
---

# Using PY Quality Gate

**PY Quality Gate** enforces Python code quality with ruff (linting/formatting) and mypy (type checking). Runs automatically on every file edit.

## What It Does

- **Ruff linting** - Fast Python linting (10-100x faster than flake8)
- **Ruff formatting** - Code formatting (Black-compatible)
- **Mypy type checking** - Static type validation
- **Auto-fix** - Automatically fixes issues when possible
- **Fast feedback** - Runs in <1s for most files

## How It Works

When you edit a Python file:

1. PostToolUse hook fires after Write/Edit/MultiEdit
2. Runs `quality-check.py` with the file path
3. Checks ruff lint, ruff format, mypy types
4. Auto-fixes issues if configured
5. Returns exit code 2 if blocking errors found

## Requirements

- Python 3.8+
- ruff installed (`pip install ruff`)
- mypy installed (`pip install mypy`) - optional

## Installation

```bash
# Install project skill
xtrm install project py-quality-gate

# Install dependencies
pip install ruff mypy
```

## Configuration

Configure via environment variables in your shell or `.env`:

```bash
# Enable/disable checks
export CLAUDE_HOOKS_RUFF_ENABLED=true
export CLAUDE_HOOKS_MYPY_ENABLED=true

# Auto-fix settings
export CLAUDE_HOOKS_AUTOFIX=true

# Debug mode
export CLAUDE_HOOKS_DEBUG=true
```

## Ruff Configuration

Create `pyproject.toml` or `ruff.toml` in your project:

```toml
[tool.ruff]
line-length = 88
target-version = "py38"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "N", "UP", "B", "C4"]
```

## Mypy Configuration

Create `mypy.ini` or `pyproject.toml`:

```ini
[mypy]
python_version = 3.8
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = False
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | Fatal error (hook crashed) |
| 2 | Blocking errors found (Claude must fix) |

## Troubleshooting

**"ruff: command not found"**
- Install: `pip install ruff` or `pipx install ruff`

**"mypy: command not found"**
- Install: `pip install mypy`
- Or set `CLAUDE_HOOKS_MYPY_ENABLED=false`

**Hook not running**
- Verify PostToolUse hook in `.claude/settings.json`
- Check Python path is correct

## Test Suggestions

The hook automatically suggests running pytest if related test files exist:
- `test_<filename>.py`
- `<filename>_test.py`
- `__tests__/test_<filename>.py`

## See Also

- Full documentation: `.claude/docs/py-quality-gate-readme.md`
- Ruff docs: https://docs.astral.sh/ruff/
- Mypy docs: https://mypy.readthedocs.io/
