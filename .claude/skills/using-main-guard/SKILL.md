# Using Main Guard

**Main Guard v2** enforces a PR-only workflow on protected branches. It blocks direct file edits, dangerous git operations, and arbitrary Bash execution on `main`/`master` — forcing all work through feature branches and pull requests.

## What It Protects

| Tool | Protected? | Notes |
|------|-----------|-------|
| Write / Edit / MultiEdit | Always blocked | Never edit files on main directly |
| `git commit` (Bash) | Blocked | Use a feature branch |
| `git push` to main (Bash) | Blocked | Use `gh pr merge` |
| Arbitrary Bash | Blocked by default | See allowlist below |

## Bash Allowlist (safe on protected branches)

These commands are always permitted:

```
git status / log / diff / branch / show / fetch / pull / stash
git checkout -b <name>    ← create feature branch (primary exit path)
git switch -c <name>      ← same
git worktree / config
gh <any>                  GitHub CLI (pr create, pr merge, etc.)
bd <any>                  beads issue tracking
```

## Emergency Override

```bash
MAIN_GUARD_ALLOW_BASH=1 <command>   # bypass for one command — use sparingly
```

## Full PR Workflow

```bash
# 1. Start from main (read-only ops allowed here)
git status
git pull

# 2. Create a feature branch
git checkout -b feature/<name>

# 3. Track your work in beads
bd create --title="..." --type=task
bd update <id> --status=in_progress

# 4. Do your work (Edit/Write/Bash now fully available)
# ... edit files, write code ...

# 5. Commit and close
bd close <id>
git add <files>
git commit -m "feat: ..."
git push -u origin feature/<name>

# 6. PR workflow
gh pr create --fill
gh pr merge --squash

# 7. Sync master
git checkout master
git reset --hard origin/master
```

## Configuration

```bash
# Override protected branches
export MAIN_GUARD_PROTECTED_BRANCHES="main,master,develop"
```

## SessionStart: pull.ff only

At session start, main-guard enforces fast-forward only pulls:

```bash
git config pull.ff only
```

This ensures `git pull` fails loudly if main has diverged, rather than silently creating a merge commit. If pull fails, investigate the divergence before proceeding.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Allowed |
| 2 | Blocked — follow the guidance in the error message |
