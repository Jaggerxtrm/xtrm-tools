## Summary

I've diagnosed the root cause of xt pi worktree extension loading failures and written findings to `/home/dawid/dev/xtrm-tools/context.md` (3.5KB).

**Root Cause:**
The `ensureCorePackageSymlink()` function creates the `@xtrm/pi-core` module symlink (`.pi/node_modules/@xtrm/pi-core → ../../extensions/core`), but it's **only called during Pi sync flows**, not during worktree startup. When `launchWorktreeSession()` spawns the Pi runtime in a fresh worktree, 5 required extensions (beads, custom-footer, quality-gates, session-flow, xtrm-loader) fail to import from `@xtrm/pi-core`.

**Fix (Recommended):**

1. **Export** `ensureCorePackageSymlink` in `cli/src/core/pi-runtime.ts` (remove private scope, line 371)
2. **Call it** in `cli/src/utils/worktree-session.ts` after the npm directory symlink setup (add ~6 lines after line 209)

This ensures the module symlink exists before Pi loads extensions, unblocking all worktree sessions with minimal risk (defensive setup step, no behavior changes to existing flows).

**Impact:** CRITICAL severity (all `xt pi` sessions blocked) | LOW risk | 2 files, ~15 LOC total

Detailed fix code snippets and validation steps in context.md.