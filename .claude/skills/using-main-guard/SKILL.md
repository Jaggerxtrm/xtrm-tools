# Using Main Guard

**Main Guard** enforces Git branch protection by blocking direct edits to protected branches (main, master, develop).

## What It Does

- **Blocks direct edits** to protected branches
- **Enforces feature branch workflow**
- **Suggests branch names** based on your task
- **Prevents accidental commits** to main/master

## How It Works

When you attempt to write or edit files:

1. PreToolUse hook fires before Write/Edit
2. Runs `main-guard.js` to check current branch
3. If on protected branch: **blocks the action**
4. If on feature branch: **allows the action**

## Protected Branches

By default, these branches are protected:
- `main`
- `master`
- `develop`

Customize via environment variable:
```bash
export MAIN_GUARD_PROTECTED_BRANCHES="main,master,develop,production"
```

## Installation

```bash
# Install project skill
xtrm install project main-guard
```

## Usage

### When Blocked

If you try to edit files on a protected branch, you'll see:

```
🛑 BLOCKED: Direct edits to protected branches

  Current branch: main

  You cannot edit files directly on a protected branch.

  📋 To proceed:
     1. Create a feature branch: git checkout -b feat/task-name
     2. Make your changes on that branch
     3. Push and create a pull request
```

### Branch Name Suggestions

The hook suggests branch names based on your task:
- `feat/issue-123` - For feature requests
- `fix/bug-456` - For bug fixes
- `feat/description` - For general features

## Configuration

### Environment Variables

```bash
# Custom protected branches
export MAIN_GUARD_PROTECTED_BRANCHES="main,master,develop,staging"

# Support wildcards
export MAIN_GUARD_PROTECTED_BRANCHES="main,master,release/*,hotfix/*"
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Allowed (not on protected branch) |
| 1 | Fatal error |
| 2 | Blocked (on protected branch) |

## Workflow

### Recommended Git Flow

```bash
# Start new feature
git checkout main
git pull origin main
git checkout -b feat/my-feature

# Make changes (main-guard allows this)
# ... edit files ...

# Commit and push
git add .
git commit -m "feat: add my feature"
git push -u origin feat/my-feature

# Create PR on GitHub/GitLab
```

### Hotfix Flow

```bash
# Emergency fix
git checkout main
git checkout -b hotfix/urgent-fix

# Make changes, commit, push
# Create PR with expedited review
```

## Troubleshooting

**"Not in a git repository"**
- Hook skips gracefully when not in git repo
- No protection applied outside git projects

**"Could not determine git branch"**
- Ensure git is installed and working
- Check if `.git` folder exists

**Hook not running**
- Verify PreToolUse hook in `.claude/settings.json`
- Check Node.js is installed

## See Also

- Full documentation: `.claude/docs/main-guard-readme.md`
- Git flow: https://nvie.com/posts/a-successful-git-branching-model/
