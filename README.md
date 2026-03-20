# XTRM-Tools

> Claude Code + Pi workflow tooling: beads gates, session-flow automation, quality checks, and service skills.

**Version 2.4.0** | [Guide](XTRM-GUIDE.md) | [Changelog](CHANGELOG.md)

---

## Current Workflow (Pi-first)

Canonical loop:

```bash
bd update <id> --claim
# implement
bd close <id> --reason "..."
```

What happens now:
- `bd update --claim` = ownership only (no worktree bootstrap).
- `bd close --reason` = canonical close action.
- Pi session-flow auto-commit attempts:
  - `git add -A && git commit -m "<close_reason> (<id>)"`
  - skipped cleanly if no changes.
- Default is **no push on close** (publish/merge remain explicit external steps).

---

## Memory Gate (Claude-style marker parity)

After successful `bd close`, Pi tracks closed issue state per session and prompts memory reflection.

Acknowledge with:

```bash
touch .beads/.memory-gate-done
```

While memory gate is pending:
- mutating tool calls are blocked
- `session_before_switch` is blocked
- `session_before_fork` is blocked
- `session_before_compact` is blocked

After marker acknowledgment, Pi clears:
- `claimed:<sessionId>`
- `closed-this-session:<sessionId>`

---

## What’s Included

| Component | Purpose |
|---|---|
| Beads Gates | Claim/edit/commit/memory workflow enforcement |
| Session Flow | `bd close`-driven auto-commit from close reason |
| Quality Gates | Post-edit quality checks (TS/JS/Python) |
| Service Skills | Routing/context for service-specific skill workflows |
| GitNexus | Graph-aware exploration/debugging support |

> Note: main-guard policy wiring is currently removed from active runtime.

---

## Commands

```bash
xtrm install all
xtrm init
xtrm status
```

Beads quick reference:

```bash
bd ready
bd update <id> --claim
bd close <id> --reason "Done"
bd remember "<insight>"
```

---

## Documentation

- [XTRM-GUIDE.md](XTRM-GUIDE.md)
- [docs/pi-extensions.md](docs/pi-extensions.md)
- [docs/hooks.md](docs/hooks.md)
- [docs/policies.md](docs/policies.md)
- [docs/testing.md](docs/testing.md)
- [docs/plans/xtpi-worktree-first-flow.md](docs/plans/xtpi-worktree-first-flow.md)

---

## Known Gap

- `jaggers-agent-tools-ycg9` (P2): TS quality-gate false negative (invalid TS can pass current hook).