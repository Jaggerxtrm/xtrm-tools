# XTRM-Tools Guide

> Operational guide for current Claude hooks + Pi extensions behavior.

## 1) Canonical Workflow

```bash
bd update <id> --claim
# work
bd close <id> --reason "..."
```

Key rules:
- `bd close` remains canonical (no wrapper replacement).
- Close reason is reused for Pi auto-commit message.
- Push/PR/merge are explicit external steps by default.

## 2) Pi Runtime (current)

### Claim
- `bd update --claim` sets ownership only.
- No claim-time worktree bootstrap.

### Close
- On successful `bd close <id> --reason "..."`, Pi session-flow attempts:
  - `git add -A`
  - `git commit -m "<close_reason> (<id>)"`
- If no file changes exist, auto-commit is skipped (no failure).

### Memory gate
- On close, Pi stores `closed-this-session:<sessionId>`.
- User is prompted to persist insight via `bd remember` and acknowledge with:

```bash
touch .beads/.memory-gate-done
```

- While pending, Pi enforces hard blocking on:
  - mutating tool calls
  - `session_before_switch`
  - `session_before_fork`
  - `session_before_compact`

- On marker acknowledgment, Pi clears:
  - `claimed:<sessionId>`
  - `closed-this-session:<sessionId>`

## 3) Claude Hooks / Pi Extensions Snapshot

### Core active behaviors
- Beads edit gate
- Beads commit gate
- Memory gate reminders + marker acknowledgment
- Session-flow close auto-commit
- Quality-gates post-edit checks

### De-scoped / deprecated behavior
- `main-guard` policy wiring is removed from active runtime.
- `xtrm finish` orchestration guidance is deprecated in Pi flow.

## 4) Publish / Merge Model

Current default:
- local iteration allowed after close
- no auto-push on close
- publish + merge remain explicit external operations

## 5) Verification commands

```bash
node scripts/compile-policies.mjs --check
node scripts/compile-policies.mjs --check-pi
npm run -s test --workspace cli -- test/extensions/beads.test.ts src/tests/session-flow-parity.test.ts src/tests/policy-parity.test.ts
```

## 6) Known gaps

- `jaggers-agent-tools-ycg9` (P2): TypeScript quality-gate false negative can allow invalid TS to pass.
- Session-end active-claim warning can be noisy because it runs at frequent `agent_end` boundaries.