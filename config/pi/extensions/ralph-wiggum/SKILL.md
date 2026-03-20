---
name: ralph-wiggum
description: "Long-running iterative development loops with pacing control and verifiable progress. Use when tasks require multiple iterations, many discrete steps, or periodic reflection with clear checkpoints. Triggers: 'ralph loop', 'iterate on', 'long-running task', 'process N items at a time'."
---

# Ralph Wiggum - Long-Running Development Loops

Use `ralph_start` tool or `/ralph start` command to begin a loop.

## Quick Start

```
ralph_start({
  name: "refactor-auth",
  taskContent: "# Task\n\n## Goals\n- Refactor auth\n\n## Checklist\n- [ ] Item 1\n- [ ] Item 2",
  maxIterations: 50,
  itemsPerIteration: 3,
  reflectEvery: 10,
  linkedIssueId: "bd-42"
})
```

## Commands

| Command | Description |
|---------|-------------|
| `/ralph start <name>` | Start new loop |
| `/ralph start <name> --from-issue <id>` | Start from bd issue |
| `/ralph resume <name>` | Resume paused loop |
| `/ralph stop` | Pause current loop |
| `/ralph status` | Show all loops |
| `/ralph link <name> <issue-id>` | Link to bd issue |
| `/ralph-stop` | Stop and close linked issue |

## Loop Behavior

1. Work on task, update `.ralph/<name>.md` each iteration
2. Call `ralph_done` to proceed to next iteration
3. Output `<promise>COMPLETE</promise>` when finished
4. If linked to bd issue, `bd close` triggers on completion

## XTRM Integration

- **Beads**: Link loops to bd issues with `--from-issue` or `/ralph link`
- **GitNexus**: Run `gitnexus_impact` before editing new symbols
- **Memory Gate**: Triggered after linked issue closed

## Task File Format

```markdown
# Task Title

## Goals
- Goal 1

## Checklist
- [ ] Item 1
- [x] Completed item

## Linked Issue
- bd-42: Issue title

## Notes
Progress updates
```
