Implemented ✅ `xt init` git-root/CWD guard in `cli/src/commands/init.ts`.

### What changed

**File:** `cli/src/commands/init.ts`

- Added a new resolver flow right after startup (`runProjectInit`) to handle CWD vs git-root mismatch:
  - Gets `cwd` via `process.cwd()`
  - Gets git root via existing `getProjectRoot()` (`git rev-parse --show-toplevel`)
  - Compares `path.resolve(cwd)` vs `path.resolve(gitRoot)`

- If they differ, now:
  - Prints a clear warning with both paths
  - Prompts user with:
    - **Abort and show instructions**
    - **Run `git init` in CWD and use this directory**
    - **Proceed anyway and target git root**
  - Supports explicit override:
    - `--yes` skips prompt and proceeds with git root
  - In non-interactive mode (no TTY, no `--yes`), aborts with actionable instructions

- Added helper functions:
  - `hasInteractiveTTY()`
  - `resolveInitProjectRoot(yes)`

- `runProjectInit()` now uses `resolveInitProjectRoot()` and returns early on abort.

---

### Tests updated

**File:** `cli/test/init-phases.test.ts`

- Stabilized cwd behavior by mocking `process.cwd()` to project root for existing tests.
- Added coverage for new behavior:
  - `--yes` from a subdirectory proceeds with git root without prompting.

---

### Validation run

- `cd cli && npx vitest run test/init-phases.test.ts` ✅
- `cd cli && npx vitest run test/init-cli.test.ts` ✅
- `cd cli && npm run build` ✅ (updated `cli/dist/index.cjs` + map)

---

If you want, I can also add a dedicated test that exercises the **interactive** `select` branch (`abort` / `git-init` / `proceed`) by mocking TTY + prompt responses.