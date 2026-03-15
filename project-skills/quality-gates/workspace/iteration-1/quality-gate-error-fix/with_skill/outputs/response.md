# Eval 3: quality-gate-error-fix

**Prompt:** I'm getting blocked by the quality gate with TypeScript errors. Here's the error: 'Type string is not assignable to type number'. How do I fix this?

**Skill Applied:** using-quality-gates

---

## Response (with skill active)

You're encountering a **blocking error** from the TypeScript Quality Gate (exit code 2). Here's how to resolve it:

### Understanding the Error

The error `Type string is not assignable to type number` means you're trying to assign a string value to a variable/parameter that expects a number type.

### Step 1: Read the Full Error Output

The quality gate output shows all issues. Example:
```
[ERROR] TypeScript compilation failed:
  src/user.ts:42:5 - error TS2322: Type 'string' is not assignable to type 'number'

[ERROR] ESLint found 1 issue:
  src/user.ts:15:10 - 'unusedVar' is defined but never used

[WARN] Auto-fix applied: 1 issue fixed
[BLOCK] 2 issues remain - fix before continuing
```

### Step 2: Fix Type Errors (Manual)

Type errors **cannot be auto-fixed** - you must fix them manually:

```typescript
// ❌ Wrong - assigning string to number
const userId: number = "123";

// ✅ Fix - convert string to number
const userId: number = parseInt("123", 10);
// or
const userId: number = Number("123");
```

Common fixes:
- Use `parseInt()` or `Number()` for string→number conversion
- Check function return types match declarations
- Verify API response types match your interfaces

### Step 3: Auto-Fix Handles Linting/Formatting

ESLint and Prettier issues are **auto-fixed** when enabled. The gate output shows:
- `[WARN] Auto-fix applied: X issues fixed` - These are done
- Remaining errors need manual fixes

### Step 4: Gate Re-runs Automatically

After you fix the issues and save the file, the Quality Gate **automatically re-runs** on the next edit. No manual trigger needed.

### Quick Fix Pattern

```typescript
// Before (type error)
function processUser(id: number, age: number) { ... }
processUser("123", "25");  // Error: string not assignable to number

// After (fixed)
function processUser(id: number, age: number) { ... }
processUser(Number("123"), Number("25"));  // ✅
```

---

**Tip:** If you see many type errors, fix them one at a time. The gate re-runs after each edit, giving you incremental feedback.
