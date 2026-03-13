# Project Skills

Modular, plug-and-play tool packages that install Claude hooks, context skills, and documentation into your project's `.claude/` directory. Each project skill targets a specific workflow concern.

## Installation

```bash
# From inside your target project directory:
xtrm install project list                  # see available skills
xtrm install project main-guard            # install one skill
xtrm install project all                   # install all skills
xtrm install project '*'                   # same (quote to avoid shell expansion)
```

Each skill installs into `.claude/` with deep-merge of `settings.json` — existing hooks and settings are preserved.

---

## Available Skills

### main-guard

**Purpose**: Enforces a PR-only workflow for protected branches (main, master, develop).

**Blocks**:
- File edits (Write/Edit/MultiEdit) on protected branches
- Dangerous git ops via Bash: `git merge`, `git cherry-pick`, `git rebase`, `git commit`, `git reset --hard`, `git push --force/-f`

**Workflow enforced**: branch/worktree → commit → `git push -u origin HEAD` → `gh pr create --fill` → `gh pr merge --squash` → `git pull --ff-only` → cleanup

**Hook**: `hooks/main-guard.cjs` (PreToolUse: Write|Edit|MultiEdit|Bash)

**Skill**: `skills/using-main-guard/SKILL.md` — full workflow reference

---

### tdd-guard

**Purpose**: Enforces Test-Driven Development — blocks implementation code until a failing test exists.

**Blocks**: Write/Edit/MultiEdit/TodoWrite when no failing test is recorded in the test reporter JSON.

**Requires**: A language-specific reporter installed in the target project:
- TypeScript/Vitest: `npm install --save-dev tdd-guard-vitest`
- TypeScript/Jest: `npm install --save-dev tdd-guard-jest`
- Python/pytest: `pip install tdd-guard-pytest`

**Hook**: `tdd-guard` CLI (npm global: `npm install -g tdd-guard`)

**Events wired**: PreToolUse (Write|Edit|MultiEdit|TodoWrite), UserPromptSubmit, SessionStart

**Skill**: `skills/using-tdd-guard/SKILL.md` — setup and troubleshooting

---

### ts-quality-gate

**Purpose**: TypeScript/ESLint/Prettier quality gate — runs automatically on every file edit and auto-fixes issues.

**Checks**: TypeScript compilation, ESLint, Prettier formatting

**Config**: `.claude/hooks/hook-config.json` (enable/disable checks, autofix)

**Hook**: `hooks/quality-check.cjs` (PostToolUse: Write|Edit|MultiEdit)

**Requires**: TypeScript, ESLint, Prettier installed in the target project

**Skill**: `skills/using-ts-quality-gate/SKILL.md` — configuration reference

---

### py-quality-gate

**Purpose**: Python ruff/mypy quality gate — linting, formatting, and type checking on every edit.

**Checks**: ruff lint, ruff format, mypy type checking

**Config**: Environment variables (`CLAUDE_HOOKS_RUFF_ENABLED`, `CLAUDE_HOOKS_MYPY_ENABLED`, `CLAUDE_HOOKS_AUTOFIX`)

**Hook**: `hooks/quality-check.py` (PostToolUse: Write|Edit|MultiEdit)

**Requires**: `pip install ruff mypy`

**Skill**: `skills/using-py-quality-gate/SKILL.md` — configuration reference

---

### service-skills-set

**Purpose**: Gives Claude persistent, service-specific expertise for Docker service projects without re-explaining architecture every session.

**Three workflow skills (Trinity)**:
- `creating-service-skills` — scaffold new expert personas via 3-phase workflow
- `using-service-skills` — discover and activate expert personas at session start
- `updating-service-skills` — detect drift when code changes and sync docs

**Five hooks**:
| Hook | Trigger | Effect |
|------|---------|--------|
| SessionStart | Session opens | Injects ~150-token service catalog |
| PreToolUse | Read/Write/Edit/Grep/Glob/Bash | Checks territory; loads relevant expert |
| PostToolUse | Write/Edit | Detects drift; notifies to sync docs |
| pre-commit | `git commit` | Warns if source changed without SSOT update |
| pre-push | `git push` | Warns if service skills are stale |

**Skill**: `skills/using-service-skills/SKILL.md` — catalog discovery guide

---

## Project Skill Structure

Each project skill follows a standard layout:

```
project-skills/<skill-name>/
└── .claude/
    ├── settings.json         # Hook configuration template
    ├── hooks/                # Hook scripts
    │   └── <hook>.[cjs|py]
    └── skills/               # Companion skills
        └── using-<skill>/
            └── SKILL.md
```

After `xtrm install project <skill>`, these are installed into your project's `.claude/` directory.

---

## Notes

- Project skills are Claude Code only (no Gemini/Qwen support)
- Always read `.claude/docs/<skill>-readme.md` after installation for additional setup
- Some skills require external dependencies (npm packages, Python packages) — see each skill above
