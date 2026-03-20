# Ralph Wiggum Extension - XTRM Adapted

Long-running agent loops for iterative development with beads integration.

## Install

Files are in `config/pi/extensions/ralph-wiggum/`. They auto-load from project extensions.

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

## Options

| Option | Description |
|--------|-------------|
| `--from-issue <id>` | Link to bd issue |
| `--items-per-iteration N` | Suggest N items per turn |
| `--reflect-every N` | Reflect every N iterations |
| `--max-iterations N` | Stop after N iterations (default 50) |

## XTRM Integration

- **Beads**: Link loops to bd issues, auto-close on completion
- **GitNexus**: Reminders to run impact analysis
- **Memory Gate**: Triggered after linked issue closed

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Main extension with commands, tools, events |
| `types.ts` | TypeScript interfaces |
| `utils.ts` | State management, file helpers, prompt building |
| `SKILL.md` | Skill documentation |
