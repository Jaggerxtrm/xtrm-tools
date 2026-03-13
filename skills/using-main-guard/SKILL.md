---
name: using-main-guard
description: Git branch protection skill that blocks direct edits to protected branches (main, master, develop). Use this skill when working with git branches, when an edit or dangerous git op is blocked by main-guard, or when starting any new task that requires code changes.
allowed-tools: Bash, Read, Write, Edit, MultiEdit
version: 2.0
---

# Using Main Guard — Branch Protection & Git Workflow

Main Guard blocks two categories of operations on protected branches (`main`, `master`, `develop`):

1. **File writes/edits** — Write, Edit, MultiEdit tool calls
2. **Dangerous git operations** — merge, cherry-pick, rebase, reset --hard, push --force, direct commit

When blocked, always follow the workflow below.

---

## Branch vs Worktree — Which to Use

| Situation | Use |
|-----------|-----|
| Short task, single agent | `git checkout -b <branch>` |
| Parallel agents, multiple tasks | `git worktree add` (preferred) |
| Avoiding stash/checkout cycles | `git worktree add` (preferred) |

**Agents should default to worktrees.** Worktrees let multiple tasks run in separate directories without interfering with each other. No stashing, no context switching.

---

## Full Workflow

### Option A — Feature Branch (simple tasks)

```bash
# 1. Start from an up-to-date main
git checkout main
git pull --ff-only

# 2. Create feature branch
git checkout -b feat/my-task

# 3. Implement (main-guard now allows writes)
# ... edit files, run tests ...

# 4. Commit
git add <files>
git commit -m "feat: describe change"

# 5. Push and open PR
git push -u origin feat/my-task
gh pr create --fill

# 6. Merge
gh pr merge --squash

# 7. Return to main and sync
git checkout main
git pull --ff-only

# 8. Cleanup
git branch -d feat/my-task
git fetch --prune
```

### Option B — Worktree (parallel/agent tasks)

```bash
# 1. Add worktree on a new branch
git worktree add ../my-task-worktree -b feat/my-task

# 2. Work inside the worktree directory
cd ../my-task-worktree
# ... implement, commit ...

# 3. Push and open PR from worktree
git push -u origin feat/my-task
gh pr create --fill

# 4. Merge
gh pr merge --squash

# 5. Cleanup worktree and branch
cd /path/to/main/repo
git worktree remove ../my-task-worktree
git branch -d feat/my-task
git fetch --prune
```

**Batch cleanup of gone branches:**
```bash
# Remove all branches where remote is deleted ([gone])
/commit-commands:clean_gone
```

---

## What Main Guard Blocks and Why

### File operations (Write/Edit/MultiEdit)
Direct file edits on protected branches bypass code review. All changes must go through a PR.

### Dangerous git operations (Bash)

| Blocked | Why |
|---------|-----|
| `git merge` | Could fast-forward unreviewed code onto main |
| `git cherry-pick` | Bypasses PR process |
| `git rebase` (onto protected) | Rewrites shared history |
| `git reset --hard` | Destroys committed work |
| `git push --force / -f` | Overwrites remote history |
| `git commit` (on protected) | Direct commit bypasses review |

### What is always allowed
- `git pull`, `git fetch` — read from remote
- `git log`, `git diff`, `git status` — read-only inspection
- `git checkout`, `git switch` — moving away from protected branch
- `git worktree` — setting up parallel workspaces
- `gh pr` commands — PR management

---

## `git pull --ff-only` Rationale

Always use `--ff-only` when syncing main. If it fails:

```
fatal: Not possible to fast-forward, abort.
```

This means something unexpected happened — diverged history, uncommitted merge, or a force-push upstream. **Do not force it.** Investigate:

```bash
git log --oneline HEAD..origin/main   # what's on remote that you don't have
git log --oneline origin/main..HEAD   # what you have that remote doesn't
```

A ff failure on main is a signal to stop and understand the state before proceeding.

---

## Configuration

**Custom protected branches:**
```bash
export MAIN_GUARD_PROTECTED_BRANCHES="main,master,develop,production"
```

**Wildcard patterns:**
```bash
export MAIN_GUARD_PROTECTED_BRANCHES="main,master,release/*,hotfix/*"
```

---

## Troubleshooting

**Blocked unexpectedly on a feature branch?**
```bash
git branch --show-current   # confirm you're not on main
```

**Hook says "not in a git repository"?**
Main guard skips when outside a git repo — no protection applies.

**Worktree shows wrong branch?**
```bash
git worktree list   # see all worktrees and their branches
```
