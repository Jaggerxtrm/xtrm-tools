# TS Quality Gate

**TypeScript/ESLint/Prettier quality gate** for Claude Code. Runs automatically on every file edit to ensure code quality.

## What It Does

TS Quality Gate enforces code quality standards in real-time:

| Check | Description | Auto-fix |
|-------|-------------|----------|
| **TypeScript** | Compilation errors, type safety | No |
| **ESLint** | Code style, best practices, rules | Yes (if enabled) |
| **Prettier** | Code formatting consistency | Yes (if enabled) |

## Installation

```bash
# Install project skill
xtrm install project ts-quality-gate
```

**Post-install:** Ensure your project has the required dependencies:

```bash
npm install --save-dev typescript eslint prettier
```

## How It Works

The quality gate runs as a `PostToolUse` hook:

1. You edit a TypeScript/JavaScript file
2. After the edit completes, the hook fires
3. `quality-check.cjs` validates the file
4. Issues are reported with auto-fix when possible
5. Exit code 2 blocks if critical errors found

## Configuration

Edit `.claude/hooks/hook-config.json` to customize:

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

### Environment Variable Overrides

```bash
export CLAUDE_HOOKS_TYPESCRIPT_ENABLED=false
export CLAUDE_HOOKS_ESLINT_AUTOFIX=true
export CLAUDE_HOOKS_PRETTIER_ENABLED=false
```

## Features

### TypeScript Checking
- Uses project's tsconfig.json
- Checks only edited file (fast)
- Optionally shows dependency errors

### ESLint Integration
- Auto-discovers .eslintrc or eslint.config.js
- Auto-fixes when `autofix: true`
- Reports errors and warnings

### Prettier Formatting
- Auto-discovers .prettierrc
- Auto-formats when `autofix: true`
- Supports all Prettier options

### Smart File Detection
- Skips non-source files
- Detects test files, CLI files, services
- Applies file-type-specific rules

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | Fatal error (hook crashed) |
| 2 | Blocking errors found (Claude must fix) |

## Troubleshooting

**Hook not running**
- Verify PostToolUse hook in `.claude/settings.json`
- Check hook path is correct

**TypeScript errors from node_modules**
- Set `showDependencyErrors: false`

**ESLint/Prettier not found**
- Install in project: `npm install --save-dev eslint prettier`
- Or disable in config

## Reference

Based on: https://github.com/bartolli/claude-code-typescript-hooks
