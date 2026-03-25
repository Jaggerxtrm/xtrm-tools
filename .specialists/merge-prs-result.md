---

## PR Queue Report — `xtrm-tools`

### Queue (oldest → newest)

| # | PR | Branch | Created |
|---|----|----|---------|
| 1 | [#162](https://github.com/Jaggerxtrm/xtrm-tools/pulls/162) | `xt/zqaj` | 2026-03-25T04:53:10Z |

Only one PR in the queue. **No draft PRs.**

---

### CI Status on #162 — ❌ FAILING (cannot merge)

All 6 matrix jobs fail (`test (node 20.x + 22.x) × (py 3.10 / 3.11 / 3.12)`).

**Root failures:**

| Failure | File | Description |
|---------|------|-------------|
| `Cannot find module '../src/commands/install-project.js'` | `test/install-project.test.ts` | Source file missing |
| `Cannot find module '../../extensions/beads'` (×5 tests) | `test/extensions/*.test.ts` | Extension source files missing |
| `AssertionError: expected 'dist/index.cjs' to be './dist/index.cjs'` | `test/config-schema.test.ts:12,16` | Path prefix mismatch |
| `AssertionError: expected [...] to not include 'npm:@aliou/pi-guardrails'` | `test/config-schema.test.ts:32` | Unexpected extension in config |
| `AssertionError: stdout to contain 'No orphaned hook entries found'` | (clean command test) | Output message mismatch |

**Critical context:** These failures are **pre-existing on `main`** — the last 5 consecutive `main` branch CI runs all failed with the same conclusion. PR #162's diff only touches `.session-meta.json` (timestamp bump) and adds `test.md`. It introduces **zero test changes** and is not the cause of any failure.

---

### Decision: 🚫 Cannot merge

Per the merge rules: **never merge a PR with failing CI**, regardless of whether the failures are pre-existing. CI must be green before merging.

**Recommended next steps:**

1. Fix the pre-existing test failures on `main` first (they appear to be a separate broken-build situation across the entire repo)
2. Once `main` CI is green, this PR will likely pass automatically (its changes are trivial)
3. Then re-run the merge queue — `gh pr merge 162 --rebase --delete-branch`

Would you like me to investigate the root cause of the failing tests on `main` and propose fixes?