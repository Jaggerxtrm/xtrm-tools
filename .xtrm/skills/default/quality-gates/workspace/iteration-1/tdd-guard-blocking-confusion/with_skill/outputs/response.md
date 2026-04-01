# Eval 5: tdd-guard-blocking-confusion

**Prompt:** Why am I getting 'No failing test found' when I try to edit src/service.ts? I just want to add a logging statement.

**Skill Applied:** using-quality-gates

---

## Response (with skill active)

You're encountering the **TDD Guard**, which enforces test-driven development for **all code changes** - including small changes like adding a logging statement.

### Why TDD Guard Blocks You

TDD Guard's purpose is to ensure **every code change is driven by a test**. This applies to:
- New features
- Bug fixes
- Refactoring
- **Even small changes like logging statements**

The philosophy: if you're adding logging, there should be a test that verifies the logging behavior (or at least a test that exercises the code path you're modifying).

### How to Proceed

**Option 1: Write a Test for the Change**

If you're adding logging to a specific function, write a test that exercises that function:

```typescript
// src/service.test.ts
import { processData } from './service';

describe('processData', () => {
  it('should process data successfully', () => {
    const result = processData({ input: 'test' });
    expect(result).toBeDefined();
    // This test exercises the code path where you're adding logging
  });
});
```

Run tests to create a failing state (or ensure test exists), then TDD Guard will allow the edit.

**Option 2: Modify an Existing Test**

If tests already exist for this code, run them to ensure TDD Guard sees them:

```bash
npm test  # or: npx vitest run
```

The test reporter generates JSON that TDD Guard reads.

### Why This Matters

Requiring tests for all changes ensures:
- **Regression protection** - Tests catch future bugs
- **Living documentation** - Tests show how code should behave
- **Confidence in refactoring** - Green tests mean you didn't break anything

### Exception: Documentation Changes

TDD Guard only blocks **code file edits** (.ts, .js, .py, etc.). Documentation files (.md, .txt) can be edited without tests.

---

**Bottom line:** Write or run a test that exercises the code you're modifying, then TDD Guard will allow the logging change.
