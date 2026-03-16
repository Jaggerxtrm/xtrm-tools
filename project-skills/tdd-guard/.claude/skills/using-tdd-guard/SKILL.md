---
name: using-tdd-guard
description: TDD Guard enforces Test-Driven Development workflow in Claude Code. Blocks implementation code until failing tests are written.
---

# Using TDD Guard

**TDD Guard** enforces Test-Driven Development workflow in Claude Code. It blocks implementation code until failing tests are written.

## What It Does

- **Blocks Write/Edit** when no failing test exists
- **Prevents over-implementation** beyond test requirements
- **Integrates with test reporters** for real-time test status

## How It Works

When you attempt to write implementation code:

1. TDD Guard intercepts the Write/Edit tool call
2. Checks if a failing test exists (via test reporter JSON)
3. If no failing test: **blocks the action** with guidance
4. If failing test exists: **allows** the implementation

## Test Reporters

TDD Guard requires a language-specific test reporter installed in your project:

| Language | Package | Setup |
|----------|---------|-------|
| TypeScript/JavaScript (Vitest) | `tdd-guard-vitest` | Add to `vitest.config.ts` |
| TypeScript/JavaScript (Jest) | `tdd-guard-jest` | Add to `jest.config.ts` |
| Python (pytest) | `tdd-guard-pytest` | Add to `conftest.py` |
| PHP (PHPUnit) | `tdd-guard-phpunit` | Add to `phpunit.xml` |
| Go | `tdd-guard-go` | Run with `go test` wrapper |
| Rust | `tdd-guard-rust` | Run with `cargo nextest` |

## Example: Vitest Setup

```bash
# Install reporter
npm install --save-dev tdd-guard-vitest
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { VitestReporter } from 'tdd-guard-vitest'

export default defineConfig({
  test: {
    reporters: [
      'default',
      new VitestReporter('/absolute/path/to/your/project'),
    ],
  },
})
```

## Commands

- `tdd-guard check` - Verify failing test exists (called by hook)
- `tdd-guard status` - Show current TDD state
- `tdd-guard session-init` - Initialize session

## Troubleshooting

**"No failing test found"**
- Write a test that fails first
- Ensure test reporter is installed and configured
- Check test reporter JSON output path

**"tdd-guard command not found"**
- Install globally: `npm install -g tdd-guard`

## See Also

- Full documentation: `.claude/docs/tdd-guard-readme.md`
- Original repo: https://github.com/nizos/tdd-guard
