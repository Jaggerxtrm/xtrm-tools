# Using TS Quality Gate

**TS Quality Gate** enforces TypeScript, ESLint, and Prettier quality checks on every file edit. It provides immediate feedback and auto-fixes issues when possible.

## What It Does

- **TypeScript compilation check** - Catches type errors immediately
- **ESLint validation** - Enforces code style and best practices
- **Prettier formatting** - Ensures consistent code formatting
- **Auto-fix** - Automatically fixes issues when possible
- **Fast feedback** - Runs in <1s for most files

## How It Works

When you edit a TypeScript/JavaScript file:

1. PostToolUse hook fires after Write/Edit
2. Runs `quality-check.js` with the file path
3. Checks TypeScript compilation, ESLint, Prettier
4. Auto-fixes issues if configured
5. Returns exit code 2 if blocking errors found

## Configuration

The quality gate is configured via `.claude/hooks/hook-config.json`:

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
    "autofixSilent": true,
    "debug": false
  }
}
```

## Requirements

- Node.js 18+
- TypeScript installed in project
- ESLint installed in project (optional)
- Prettier installed in project (optional)

## Installation

```bash
# Install project skill
xtrm install project ts-quality-gate

# Ensure dependencies are installed in your project
npm install --save-dev typescript eslint prettier
```

## Troubleshooting

**"ESLint not found"**
- Install ESLint: `npm install --save-dev eslint`
- Or disable in hook-config.json: `"eslint": { "enabled": false }`

**"Prettier not found"**
- Install Prettier: `npm install --save-dev prettier`
- Or disable in hook-config.json: `"prettier": { "enabled": false }`

**TypeScript errors from dependencies**
- Set `"showDependencyErrors": false` in hook-config.json

## See Also

- Full documentation: `.claude/docs/ts-quality-gate-readme.md`
- Reference: https://github.com/bartolli/claude-code-typescript-hooks
