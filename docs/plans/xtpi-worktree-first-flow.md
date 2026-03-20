# Unified Workflow Plan (Claude + Pi + Specialists)

Status: Active (decision update)
Owner issue: `jaggers-agent-tools-xepd`

## 1) Final Naming + CLI Decision

- **Canonical CLI:** `xtrm`
- **Short alias:** `xt`
- Both are supported; docs should prefer `xt` for brevity and keep `xtrm` as canonical/stable.

`xtpi` is no longer the primary naming direction.

---

## 2) Command Structure (decided now)

### Global
- `xt init`
- `xt status`
- `xt doctor`
- `xt install [all|basic|pi|claude|specialists]`
- `xt update`

### Runtime-specific
- `xt claude <install|status|doctor|reload>`
- `xt pi <install|status|doctor|reload>`

### Specialists integration
- `xt sp list`
- `xt sp run <specialist> --prompt "..."`
- `xt sp status [job-id]`
- `xt sp result <job-id>`
- `xt sp stop <job-id>`

### Specialist shorthand (reserved)
- `xt @<specialist> "<prompt>"` → alias of `xt sp run ...`

This keeps top-level command space clean if specialists becomes a primary runner.

---

## 3) Core Workflow Contract (shared across Claude + Pi)

Canonical loop stays beads-first:

```bash
bd update <id> --claim
# work
bd close <id> --reason "..."
```

Rules:
1. `bd update --claim` = ownership only.
2. `bd close --reason` = canonical close action.
3. Close reason is reused for auto-commit message where session-flow automation is active.
4. No wrapper command replaces canonical `bd close`.
5. Push/PR/merge remain explicit external steps by default.

---

## 4) Implemented Behavior (current)

### A) Claim behavior
- No claim-time worktree/session bootstrap.

### B) Close behavior
- Pi session-flow auto-commit on successful close:
  - `git add -A && git commit -m "<close_reason> (<id>)"`
  - no-op if no changes.
- Default: **no push on close**.

### C) Memory gate parity + hard enforcement
- On close, set `closed-this-session:<sessionId>`.
- Prompt memory reflection and marker acknowledgment:
  - `touch .beads/.memory-gate-done`
- While pending, Pi blocks:
  - mutating `tool_call`
  - `session_before_switch`
  - `session_before_fork`
  - `session_before_compact`
- On marker consume, clear:
  - `claimed:<sessionId>`
  - `closed-this-session:<sessionId>`

### D) Main-guard
- Active main-guard policy wiring removed from current runtime due regressions.

---

## 5) Claude vs Pi Parity Model

This plan is shared; implementation points differ by runtime:

- **Claude path:** hook events (`PreToolUse`, `PostToolUse`, `Stop`, etc.)
- **Pi path:** extension events (`tool_call`, `tool_result`, `agent_end`, `session_before_*`, etc.)

Behavioral contract must remain aligned even if enforcement mechanics differ.

---

## 6) Specialists Complement Model (boundary)

- **xtrm/xt owns:** local runtime gates, session-flow, policy wiring, close/memory semantics.
- **specialists owns:** delegation/orchestration execution plane (specialist runs, background jobs, job lifecycle).

Integration contract:
1. specialists accepts issue/work context; does not redefine beads close semantics.
2. specialists output links back to beads/job records.
3. no duplicate ownership of claim/close state transitions.
4. memory decision flow remains compatible with marker acknowledgment contract.

---

## 7) Known Gaps / Follow-ups

- `jaggers-agent-tools-ycg9` (P2): TS quality-gate false negative (invalid TS can pass current hook).
- Active-claim warning at `agent_end` is noisy; consider throttling or shutdown-only variant.

---

## 8) Success Criteria

- One shared workflow model for Claude and Pi.
- Command namespace is settled (`xtrm` canonical, `xt` alias, `xt sp` specialists domain).
- `bd close` remains canonical with reason reuse.
- Memory gate marker flow works and is enforceable.
- specialists integrates as complementary orchestration, not competing workflow authority.