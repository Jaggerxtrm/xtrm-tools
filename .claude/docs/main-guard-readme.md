# Main Guard

**Git branch protection** for Claude Code. Blocks direct edits to main/master branches and enforces feature branch workflow.

## What It Does

Main Guard prevents accidental commits to protected branches:

| Feature | Description |
|---------|-------------|
| **Branch blocking** | Prevents Write/Edit on protected branches |
| **Branch suggestions** | Suggests feature branch names |
| **Custom patterns** | Configure which branches are protected |
| **Git flow enforcement** | Encourages PR-based workflow |

## Installation

```bash
# Install project skill
xtrm install project main-guard
```

## How It Works

The guard runs as a `PreToolUse` hook:

1. You attempt to write/edit a file
2. Before the edit, the hook checks current branch
3. If on protected branch: **blocks with instructions**
4. If on feature branch: **allows the edit**

## Protected Branches

**Default:**
- `main`
- `master`
- `develop`

**Customize:**
```bash
export MAIN_GUARD_PROTECTED_BRANCHES="main,master,develop,production"
```

**Supports wildcards:**
```bash
export MAIN_GUARD_PROTECTED_BRANCHES="main,master,release/*,hotfix/*"
```

## Usage

### Blocked Message

When you try to edit on a protected branch:

```
🛑 BLOCKED: Direct edits to protected branches

  Current branch: main

  📋 To proceed:
     1. Create a feature branch: git checkout -b feat/task
     2. Make your changes on that branch
     3. Push and create a pull request
```

### Allowed

When on a feature branch:
```
✅ Git workflow check passed
   Branch: feat/my-feature
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAIN_GUARD_PROTECTED_BRANCHES` | `main,master,develop` | Comma-separated list of protected branches |

### Setup

Add to your shell profile (`~/.bashrc`, `~/.zshrc`):
```bash
export MAIN_GUARD_PROTECTED_BRANCHES="main,master"
```

Or create `.env` in your project:
```bash
MAIN_GUARD_PROTECTED_BRANCHES=main,master,develop
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Allowed (not on protected branch) |
| 1 | Fatal error |
| 2 | Blocked (on protected branch) |

## Git Flow

### Standard Feature Development

```bash
# Start from main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feat/user-authentication

# Make changes (main-guard allows this)
# Edit files, commit, push
git add .
git commit -m "feat: add user authentication"
git push -u origin feat/user-authentication

# Create PR on GitHub
```

### Hotfix

```bash
# Emergency fix from main
git checkout main
git checkout -b hotfix/login-bug

# Fix, commit, push, PR
```

### Release Branch

```bash
# Prepare release
git checkout -b release/v1.2.0

# Final testing, version bump
# Merge to main and develop
```

## Benefits

- ✅ Prevents accidental direct commits to main
- ✅ Enforces code review via PRs
- ✅ Maintains clean main branch history
- ✅ Encourages proper Git workflow

## Troubleshooting

**"Not in a git repository"**
- Hook skips when not in git project
- No protection outside git repos

**Node.js not found**
- Install Node.js: `node --version`
- Hook requires Node.js to run

## See Also

- Git Flow: https://nvie.com/posts/a-successful-git-branching-model/
- GitHub Flow: https://docs.github.com/en/get-started/using-github/github-flow
