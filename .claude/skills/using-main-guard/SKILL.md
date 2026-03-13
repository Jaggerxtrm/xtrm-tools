---
name: using-main-guard
description: >-
  Git branch protection skill. Blocks direct file edits and dangerous git
  operations (merge, cherry-pick, rebase, commit, reset --hard, force-push) on
  protected branches (main, master, develop). Use this skill when an edit or
  git command is blocked, when starting new work and unsure which branch
  workflow to follow, or when you need the correct branch/worktree → push → PR
  → merge → cleanup sequence.
---

# Using Main Guard

**Main Guard** enforces a PR-only workflow for protected branches. It blocks:

- **File edits** (Write/Edit/MultiEdit) directly on protected branches
- **Dangerous git ops** via Bash: `git merge`, `git cherry-pick`, `git rebase`,
  `git commit`, `git reset --hard`, `git push --force/-f`

All changes to protected branches must go through GitHub PRs.

---

## The Correct Workflow

### 1. Start: Create a Branch or Worktree

**Worktrees (preferred for agents)** — isolated working directory, main stays clean:

```bash
git worktree add ../feat-task-name feat/task-name
cd ../feat-task-name
```

**Simple branch** — for quick or interactive tasks:

```bash
git checkout -b feat/task-name
# or: git checkout -b fix/issue-123
```

Branch naming conventions:
- `feat/<description>` — new feature
- `fix/<description>` — bug fix or issue reference (`fix/issue-123`)
- `chore/<description>` — maintenance, docs, config

### 2. Work and Commit

Make your changes, then commit on the feature branch:

```bash
git add <specific-files>
git commit -m "feat: description of change"
```

### 3. Push and Open PR

```bash
git push -u origin HEAD
gh pr create --fill
```

`--fill` uses your commit message as PR title and body. Edit as needed before submitting.

### 4. Merge via GitHub

```bash
gh pr merge --squash    # squash all commits into one clean entry on main
# or:
gh pr merge --merge     # preserve full commit history
```

Squash merge is preferred — keeps main's history linear and readable.

### 5. Sync Main

After merge, update your local main:

```bash
git checkout main
git pull --ff-only
```

`--ff-only` prevents accidental local merges — if it fails, something is wrong upstream.

### 6. Cleanup

Remove the feature branch and worktree:

```bash
# Worktree (if used)
git worktree remove ../feat-task-name

# Delete local branch
git branch -d feat/task-name

# Prune stale remote-tracking refs
git fetch --prune
```

For bulk cleanup of branches marked `[gone]` (deleted on remote): `/commit-commands:clean_gone`

---

## Protected Branches

Default: `main`, `master`, `develop`

Customize via environment variable:

```bash
export MAIN_GUARD_PROTECTED_BRANCHES="main,master,develop,production"
# Wildcards supported:
export MAIN_GUARD_PROTECTED_BRANCHES="main,master,release/*,hotfix/*"
```

---

## What Gets Blocked

### File Edits (Write/Edit/MultiEdit)

Any file write on a protected branch is blocked immediately. Create a feature
branch first.

### Dangerous Git Operations (Bash)

When on a protected branch, these Bash commands are blocked:

| Command | Reason |
|---------|--------|
| `git merge` | Bypasses PR — use `gh pr merge` instead |
| `git cherry-pick` | Direct cherry-pick bypasses review |
| `git rebase` | Rebasing onto protected branch bypasses review |
| `git commit` | Committing directly to protected branch — use a feature branch |
| `git reset --hard` | Destructive — could lose history |
| `git push --force` / `git push -f` | Never allowed on protected branches |

These are always **allowed**:
- `git pull --ff-only` — safe linear sync
- `git fetch` / `git fetch --prune` — read-only
- `gh pr create`, `gh pr merge` — proper PR workflow
- `git log`, `git status`, `git diff` — read-only ops

---

## Hook Coverage

| Event | Matcher | What it checks |
|-------|---------|----------------|
| `PreToolUse` | `Write\|Edit\|MultiEdit` | Blocks file edits on protected branches |
| `PreToolUse` | `Bash` | Blocks dangerous git ops on protected branches |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Allowed |
| 1 | Fatal error |
| 2 | Blocked |

---

## Troubleshooting

**"Not in a git repository"** — Hook skips gracefully, no protection applied.

**Hook not running** — Verify both PreToolUse entries in `.claude/settings.json`;
check Node.js is installed.

## See Also

- Full documentation: `.claude/docs/main-guard-readme.md`
- Bulk branch cleanup: `/commit-commands:clean_gone`
