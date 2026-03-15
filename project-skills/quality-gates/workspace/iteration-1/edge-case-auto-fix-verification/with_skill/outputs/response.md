# Eval 15: edge-case-auto-fix-verification

**Prompt:** The quality gate said it auto-fixed 3 issues but I still have 2 errors. What happened?

**Skill Applied:** using-quality-gates

---

## Response (with skill active)

This is expected behavior. Here's what happened:

### Auto-Fix Limitations

**Auto-fix handles:**
- ✅ Prettier formatting issues (indentation, quotes, semicolons)
- ✅ ESLint stylistic rules (unused vars, prefer const, etc.)
- ✅ Ruff linting issues (imports, style, simple fixes)

**Auto-fix CANNOT handle:**
- ❌ TypeScript type errors (wrong types, missing properties)
- ❌ Mypy type errors (type mismatches)
- ❌ Complex logic errors
- ❌ Missing imports or undefined variables

### Reading the Output

```
[WARN] Auto-fix applied: 3 issues fixed
[ERROR] TypeScript compilation failed:
  src/user.ts:42:5 - error TS2322: Type 'string' is not assignable to type 'number'
[ERROR] ESLint found 1 issue that could not be auto-fixed:
  src/user.ts:28:3 - Missing return type on function
[BLOCK] 2 issues remain - fix before continuing
```

### How to Fix Remaining Issues

1. **Type errors** — Add proper types or convert values:
   ```typescript
   // Fix: convert string to number
   const userId: number = Number(inputId);
   ```

2. **Missing return types** — Add explicit type annotations:
   ```typescript
   // Fix: add return type
   function getUser(id: number): User { ... }
   ```

3. **Save the file** — Quality Gate re-runs automatically on next edit

### Why This Design?

Auto-fix is conservative — it only applies fixes that are guaranteed safe. Type errors require human judgment to fix correctly.

---

**Result:** ✅ Explains auto-fix limitations, distinguishes fixable vs manual issues
