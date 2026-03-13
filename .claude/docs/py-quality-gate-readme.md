# PY Quality Gate

**Python quality gate** for Claude Code. Runs ruff (linting/formatting) and mypy (type checking) automatically on every file edit.

## What It Does

PY Quality Gate enforces Python code quality standards in real-time:

| Check | Description | Auto-fix |
|-------|-------------|----------|
| **Ruff lint** | Code style, best practices, errors | Yes |
| **Ruff format** | Black-compatible formatting | Yes |
| **Mypy types** | Static type checking | No |

## Installation

```bash
# Install project skill
xtrm install project py-quality-gate

# Install Python dependencies
pip install ruff mypy
```

## How It Works

The quality gate runs as a `PostToolUse` hook:

1. You edit a Python file
2. After the edit completes, the hook fires
3. `quality-check.py` validates the file
4. Issues are reported with auto-fix when possible
5. Exit code 2 blocks if critical errors found

## Configuration

### Environment Variables

```bash
# Enable/disable checks
export CLAUDE_HOOKS_RUFF_ENABLED=true
export CLAUDE_HOOKS_MYPY_ENABLED=true

# Auto-fix settings
export CLAUDE_HOOKS_AUTOFIX=true

# Debug mode
export CLAUDE_HOOKS_DEBUG=true
```

### Ruff Configuration

Create `pyproject.toml` in your project:

```toml
[tool.ruff]
line-length = 88
target-version = "py38"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "N", "UP", "B", "C4"]
ignore = ["E501"]  # Line length (handled by formatter)
```

### Mypy Configuration

Create `mypy.ini` in your project:

```ini
[mypy]
python_version = 3.8
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = False
ignore_missing_imports = True
```

## Features

### Ruff Linting
- 10-100x faster than flake8
- Auto-fixes supported
- 500+ built-in rules
- Compatible with Black

### Ruff Formatting
- Black-compatible formatter
- Fast and consistent
- Auto-fixes formatting issues

### Mypy Type Checking
- Static type validation
- Catches type errors before runtime
- Configurable strictness

### Smart Test Suggestions
- Detects related test files
- Suggests running pytest
- Supports multiple test naming conventions

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | Fatal error (hook crashed) |
| 2 | Blocking errors found |

## Troubleshooting

**Ruff not found**
```bash
pip install ruff
# or
pipx install ruff
```

**Mypy not found**
```bash
pip install mypy
```

**Hook not running**
- Verify PostToolUse hook in `.claude/settings.json`
- Check Python path: `which python3`

**False positives from dependencies**
- Add to `mypy.ini`: `ignore_missing_imports = True`
- Add to `pyproject.toml`: exclude patterns

## Quick Commands

```bash
# Run ruff manually
ruff check .
ruff format .

# Run mypy manually
mypy .

# Run pytest
pytest
```

## Reference

Inspired by: https://github.com/bartolli/claude-code-typescript-hooks
