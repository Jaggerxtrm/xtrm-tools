<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **jaggers-agent-tools** (1900 symbols, 4715 relationships, 135 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/refactoring/SKILL.md` |

## Tools Reference

| Tool | What it gives you |
|------|-------------------|
| `query` | Process-grouped code intelligence — execution flows related to a concept |
| `context` | 360-degree symbol view — categorized refs, processes it participates in |
| `impact` | Symbol blast radius — what breaks at depth 1/2/3 with confidence |
| `detect_changes` | Git-diff impact — what do your current changes affect |
| `rename` | Multi-file coordinated rename with confidence-tagged edits |
| `cypher` | Raw graph queries (read `gitnexus://repo/{name}/schema` first) |
| `list_repos` | Discover indexed repos |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource | Content |
|----------|---------|
| `gitnexus://repo/{name}/context` | Stats, staleness check |
| `gitnexus://repo/{name}/clusters` | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->

## Issue Tracking

This project uses **[bd (beads)](https://github.com/steveyegge/beads)** — a git-backed issue tracker with first-class dependency support and persistent memory across conversation compaction.

### Session Protocol

```bash
bd ready                        # Find unblocked work
bd show <id>                    # Get full context on an issue
bd update <id> --claim          # Claim and start work atomically
bd close <id> --reason "..."    # Complete task
bd dolt push                    # Push to remote (if configured)
```

### Creating Issues

```bash
bd create "Title" --type task --priority 2   # Standard task
bd q "Quick capture title"                   # Quick capture, outputs ID only
bd todo add "Small task"                     # Convenience wrapper for tasks
```

### Dependencies & Structure

```bash
bd dep add <id> --blocked-by <other-id>   # Set dependency
bd blocked                                 # Show blocked issues
bd graph                                   # Visualize dependency graph
bd epic list                               # List epics
```

### Viewing & Searching

```bash
bd list                          # All open issues
bd search "query"                # Text search
bd stale                         # Issues not updated recently
bd status                        # Database overview + stats
bd find-duplicates               # Find semantically similar issues
```

### Advanced

```bash
bd agent --help                  # Agent bead state tracking
bd gate --help                   # Async coordination gates (human-in-the-loop)
bd mol --help                    # Molecules — reusable work templates
bd audit                         # Append-only agent interaction log
bd prime                         # AI-optimized workflow context (full reference)
```

### When to Use bd vs TodoWrite

| Use **bd** | Use **TodoWrite** |
|---|---|
| Work spans multiple sessions | Single-session tasks |
| Tasks have dependencies/blockers | Linear execution |
| Need to survive conversation compaction | All context in current conversation |
| Team collaboration / git sync | Local to session |
