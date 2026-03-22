---
name: xt-merge
description: |
  Merges queued PRs from xt worktree sessions in the correct order (FIFO), maintaining linear
  history by rebasing remaining PRs after each merge. Use this skill whenever the user has
  multiple open PRs from xt worktrees, asks to "merge my PRs", "process the PR queue",
  "drain the queue", "merge worktree branches", or says "what PRs do I have open".
  Also activate after any xt-end completion when other PRs are already open, or when the
  user asks "can I merge yet" or "is CI green". Handles the full sequence: list → sort →
  CI check → merge oldest → rebase cascade → repeat until queue is empty.
---

# merge-prs — Worktree PR Merge Workflow

You are draining a queue of PRs created by `xt end` from multiple worktree sessions.
The key constraint is **ordering**: merge in FIFO order and rebase the remaining PRs
after each merge. Work through the stages below in sequence.

---

## Why FIFO and why the rebase cascade matters

When `xt end` runs, it rebases the worktree branch onto `origin/main` at that moment
and pushes. If you ran three sessions in sequence:

```
Session A finishes at t=1 → xt/feature-a rebased onto main@sha1
Session B finishes at t=2 → xt/feature-b rebased onto main@sha2 (sha2 >= sha1)
Session C finishes at t=3 → xt/feature-c rebased onto main@sha3 (sha3 >= sha2)
```

After merging A, main advances to sha4. Branch B is now based on sha2 — it still
compiles and CI passes, but it doesn't include A's changes. You must rebase B onto
sha4 before merging, so the history stays linear and B's CI reflects the real state
of main + B.

**FIFO = merge the oldest-created PR first.** The older the PR, the smaller the
rebase cascade it triggers in subsequent branches. Merging out of order means
you're rebasing more than necessary and risk conflicts that wouldn't have existed.

---

## Stage 1 — Build the queue

List all open PRs from xt worktree branches:

```bash
gh pr list --state open --json number,title,headRefName,createdAt,isDraft \
  --jq '.[] | select(.headRefName | startswith("xt/")) | [.number, .createdAt, .headRefName, .title] | @tsv' \
  | sort -k2
```

This sorts by creation time. The top row is the **head of the queue** — merge it first.

If there are draft PRs in the list, skip them. Drafts are not ready to merge.

Present the sorted queue to the user before proceeding:
```
Queue (oldest → newest):
  #42  xt/fix-auth-gate       "Fix beads edit gate claim check"     2026-03-21 10:14
  #45  xt/add-release-script  "Add release script for npm publish"  2026-03-21 14:32
  #47  xt/default-branch      "Detect default branch in xt end"     2026-03-22 09:11
```

---

## Stage 2 — Check CI on the head PR

```bash
gh pr checks <number>
```

Wait for all checks to pass. If CI is still running, tell the user and pause — don't
merge a PR with pending or failing checks.

If CI is failing:
- Show the failing check names and link to the run
- Do NOT proceed with the merge
- Let the user decide: fix the issue in the worktree (may already be deleted), push a
  fixup commit directly to the branch, or close the PR

---

## Stage 3 — Merge the head PR

```bash
gh pr merge <number> --rebase --delete-branch
```

Use `--rebase` (not `--squash` or `--merge`) to keep linear history and preserve
individual commits from the session. Use `--delete-branch` to clean up the remote branch.

After merge, confirm main advanced:
```bash
git fetch origin
git log origin/main --oneline -3
```

---

## Stage 4 — Rebase cascade (all remaining PRs)

For every remaining PR in the queue, rebase its branch onto the new main:

```bash
git fetch origin main
git checkout xt/<branch>
git rebase origin/main
git push origin xt/<branch> --force-with-lease
```

Repeat for each remaining branch. Do them in queue order (oldest next).

After pushing, GitHub will re-trigger CI on each rebased PR. You don't need to wait
for CI here — the rebase just gets the branches current. CI will run in parallel.

### If rebase conflicts occur

```bash
git status          # shows conflicted files
# edit each file to resolve <<<< ==== >>>> markers
git add <resolved-files>
git rebase --continue
```

Conflicts mean two sessions touched the same file. Resolve carefully:
- Keep both changes if they're in different parts of the file
- If they overlap, understand what each session was doing and merge the intent
- When unsure, call the user in to review before continuing

After resolving, push with `--force-with-lease` and move to the next branch.

---

## Stage 5 — Repeat

Go back to Stage 2 with the new head of the queue. Check CI, merge, rebase cascade,
repeat until the queue is empty.

The full loop:
```
while queue not empty:
  wait for CI green on head PR
  merge head PR (--rebase --delete-branch)
  rebase all remaining PRs onto new main
  push each (--force-with-lease)
```

---

## Stage 6 — Done

When the queue is empty:
```bash
gh pr list --state open
git log origin/main --oneline -5
```

Confirm no open xt/ PRs remain and show the user the final state of main.

---

## Edge cases

**PR was already merged**: `gh pr merge` will error. Skip it and continue.

**Branch was deleted** (worktree cleaned up by `xt end --keep`): The remote branch
still exists (pushed by `xt end`). The local branch may not. Check out from remote:
```bash
git fetch origin
git checkout -b xt/<branch> origin/xt/<branch>
```

**CI never triggers after rebase push**: GitHub sometimes needs a nudge. Close and
re-open the PR, or push an empty commit:
```bash
git commit --allow-empty -m "trigger CI"
git push origin xt/<branch>
```

**Dependent sessions** (B was intentionally built on A's work): If session B was
started from inside session A's worktree rather than from main, B's branch already
contains A's commits. In this case B will rebase cleanly onto main after A merges —
its commits are a superset. No special handling needed; the rebase just eliminates
the duplicate commits.

**Multiple conflicts across many PRs**: If the cascade produces conflicts in several
branches, tackle them one at a time in queue order. Don't try to resolve all of them
before pushing any — push each one as you resolve it so CI starts running in parallel
while you work on the next.
