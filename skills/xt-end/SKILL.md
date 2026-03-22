---
name: xt-end
description: |
  Autonomous session close flow for xt worktree sessions. Use this skill whenever
  the user says "done", "finished", "wrap up", "close session", "ship it", "I'm done",
  "ready to merge", or similar. Also activate when all beads issues in the session
  are closed, or when the user explicitly runs /xt-end. This skill guides the agent
  through pre-flight checks, commit cleanup, PR creation via 'xt end', conflict
  resolution, and worktree cleanup — handling every edge case so the agent doesn't
  need to figure it out from scratch.
---

# xt-end — Session Close Flow

You are closing an `xt` worktree session. The canonical CLI is `xt end`, but it has preconditions you need to satisfy first. Work through these stages in order.

## Stage 1 — Pre-flight: close all open work

Run:
```bash
bd list --status=in_progress
bd list --status=open
```

If any issues are still open or in_progress, **do not proceed**. Guide the user to finish them first:
- For in-progress work: complete it, then `bd close <id> --reason "what was done"`
- For open issues that won't be done in this session: ask the user — close as deferred, or leave for next session?

Only continue when `bd list --status=in_progress` returns empty (or the user explicitly says to skip unfinished issues).

## Stage 2 — Uncommitted changes

```bash
git status
```

If the working tree is dirty:
- If the changes belong to a beads issue you just closed: `git add -A && git commit -m "<close_reason> (<id>)"` (or a descriptive summary)
- If the changes are unrelated WIP: consider stashing with `git stash` and noting what was stashed
- Never run `xt end` with a dirty working tree — it will abort with an error

## Stage 3 — Dry run (preview the PR)

```bash
xt end --dry-run
```

This shows the PR title, body, files changed, and issues that will be linked. Review with the user:
- Does the PR title accurately reflect the work?
- Are all the right issues captured?
- Is the scope correct?

If something looks wrong, adjust (e.g., add a missing commit message or close a forgotten issue) and re-run the dry run.

## Stage 4 — Run xt end

```bash
xt end
```

### If it succeeds
You'll see:
- ✓ Rebased onto origin/<default-branch>
- ✓ Pushed branch
- ✓ PR created: <url>
- ✓ Linked PR to N issue(s)

Capture the PR URL for Stage 6.

### If rebase conflicts occur

`xt end` will abort cleanly with a list of conflicted files. Guide the agent through:

```bash
git status                          # see conflicted files
# Edit each conflicted file to resolve <<<< ==== >>>> markers
git add <resolved-files>
git rebase --continue
```

Then re-run `xt end`. If the conflicts are complex, explain what each file conflict is about before resolving.

### If the push fails

Usually a stale remote ref. Try:
```bash
git fetch origin
xt end
```

## Stage 5 — Worktree cleanup

After a clean PR creation, ask the user:

> "PR is open at <url>. Should I remove this worktree? (Recommended: yes, since the branch is pushed and the PR is open. Keep only if you plan to do follow-up work here.)"

Default recommendation: **remove** (the branch is safe on remote, the worktree is just disk space).

If removing:
```bash
xt end --keep   # was already run; use git worktree remove directly
git worktree remove <path> --force
```

Or if `xt end` was run interactively, it already prompted for this — just confirm.

## Stage 6 — Report

Tell the user:
- PR URL
- Which issues were linked
- Reminder: "Monitor CI — merge when green. No auto-merge."

If the worktree was removed: confirm that too.

---

## Edge cases

**Already on main/master branch**: `xt end` will error — you're not in an xt session. Don't run it from the default branch.

**No commits yet on branch**: The PR will have no changes. This usually means something went wrong earlier. Verify with `git log origin/<default-branch>..HEAD` (where default-branch is main or master).

**`gh` CLI not authenticated**: `gh pr create` will fail. Fix: `gh auth login`, then re-run `xt end`.

**Multiple conflicts**: Resolve all files before `git rebase --continue`. If `git status` shows unmerged paths, keep resolving.

**beads not available**: `xt end` gracefully skips beads linkage if `bd` isn't running. The PR still gets created. Let the user know.
