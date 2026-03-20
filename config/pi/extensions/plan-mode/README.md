# Plan Mode Extension - Beads-Integrated

Read-only exploration mode that creates bd issues from plans.

## Features

- **Read-only tools**: Restricts available tools during planning
- **Bash allowlist**: Only read-only bash commands allowed
- **Auto epic creation**: Plan steps become bd issues automatically
- **Test planning**: Creates test issues per layer (core/boundary/shell)
- **GitNexus integration**: Reminders to run impact analysis
- **Beads workflow**: Execution via bd ready/claim/close

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode |
| `/plan-status` | Show current epic/issue status |
| `/next` | Claim next ready issue from epic |

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+P` | Toggle plan mode |

## Workflow

### 1. Planning Phase

1. Enable plan mode: `/plan`
2. Agent explores codebase using GitNexus tools
3. Agent creates numbered plan under "Plan:" header
4. Approve epic creation

### 2. Epic Creation

- Epic title auto-derived from user prompt
- Each plan step becomes a bd issue with:
  - Proper type (feature/task/bug/chore)
  - Priority based on position
  - Layer classification (core/boundary/shell)
  - GitNexus safety reminders
- Test issues created per layer

### 3. Execution Phase

1. First issue auto-claimed
2. Implement changes
3. `bd close <id> --reason "Done"` (auto-commits)
4. `/next` to claim next issue
5. Repeat until complete

## Plan Format

```
Plan:
1. Implement user authentication
2. Add JWT token validation
3. Create login/logout endpoints
4. Write integration tests
```

## Layer Classification

| Layer | Signals | Test Strategy |
|-------|---------|---------------|
| Core | implement, compute, parse, validate | Unit + property |
| Boundary | API, endpoint, client, fetch | Contract (live) |
| Shell | CLI, command, workflow | Integration |

## GitNexus Safety

Each issue description includes:
- Affected symbols (if detected)
- Reminder to run `gitnexus_impact` before editing
- Reminder to run `gitnexus_detect_changes` before commit

## Example Flow

```
User: Add user authentication

Agent: [explores with gitnexus_query, gitnexus_impact]
       [creates plan]

Plan Steps (4):
1. ☐ Implement user model [feature/core]
2. ☐ Add password hashing [task/core]
3. ☐ Create auth endpoints [feature/boundary]
4. ☐ Write auth tests [task/shell]

User: [approves "Yes, create epic"]

System: Created epic bd-42
        Created issue bd-43: Implement user model
        Created issue bd-44: Add password hashing
        Created issue bd-45: Create auth endpoints
        Created issue bd-46: Write auth tests
        Created test issue bd-47: Test core layer

User: [starts execution]

Agent: [claims bd-43, implements, bd close bd-43 --reason "Done"]
       [/next]
       [claims bd-44, implements, bd close bd-44 --reason "Done"]
       ...
       [all issues closed]

Plan Complete! ✓
```

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Main extension logic |
| `utils.ts` | Plan parsing, classification |
| `beads.ts` | bd command wrappers |
| `test-planning.ts` | Layer classification, test issue creation |
| `types.ts` | TypeScript interfaces |
