# xtpi / Pi Workflow Plan (Current State)

Status: Active (updated to implemented behavior)
Owner issue: `jaggers-agent-tools-xepd`

## 1) Goal

Keep Pi + beads aligned to a **claim → work → close** loop with minimal friction:
- `bd` stays canonical (`bd update --claim`, `bd close --reason`)
- close reason drives auto-commit in Pi session flow
- memory/remember flow uses Claude-style marker acknowledgment
- publish/merge stay explicit external steps

---

## 2) What is Working Now (Implemented)

### A) Claim behavior
- `bd update <id> --claim` is ownership only.
- No worktree/session bootstrap is triggered from claim.

### B) Close behavior
- `bd close <id> --reason "..."` is canonical.
- Pi session-flow derives commit message from close reason:
  - `git add -A && git commit -m "<close_reason> (<id>)"`
  - if no changes, auto-commit is skipped (no failure).
- Default policy: **no push on close**.

### C) Memory gate parity + hard enforcement
- On successful `bd close`, Pi sets `closed-this-session:<sessionId>`.
- Pi reminds user to persist memory (`bd remember ...`) and acknowledge with:
  - `touch .beads/.memory-gate-done`
- Pending memory gate is now enforced by Pi extension:
  - blocks mutating `tool_call`s while pending
  - blocks `session_before_switch`
  - blocks `session_before_fork`
  - blocks `session_before_compact`
- On marker acknowledgment, Pi clears:
  - `claimed:<sessionId>`
  - `closed-this-session:<sessionId>`

### D) Main-guard policy wiring
- Active `main-guard` policy wiring was removed due workflow regressions.
- Current workflow relies on beads/session gates rather than main-branch hard blocking.

---

## 3) Current Operator Flow

1. Create/select issue
2. `bd update <id> --claim`
3. Implement changes
4. `bd close <id> --reason "..."`
5. Pi auto-commit from close reason (or no-op if clean)
6. If memory gate prompt appears:
   - `bd remember "<insight>"` (or decide nothing to persist)
   - `touch .beads/.memory-gate-done`
7. Publish/merge explicitly outside close flow

---

## 4) Guardrails (Current)

1. Edit gate: mutating edits require active claim when trackable work exists.
2. Commit gate: manual commit blocked while active claim remains in progress.
3. Memory gate: pending closed-this-session blocks session transitions and mutating tools until marker ack.

---

## 5) Known Gaps / Follow-ups

- `jaggers-agent-tools-ycg9` (P2): TS quality gate false negative; invalid TS can pass current hook.
- `jaggers-agent-tools-8678`: docs/spec sync task (this stream).
- Session-end active-claim warning is currently noisy because it runs frequently at `agent_end`; consider rate-limiting or `session_shutdown`-only variant.

---

## 6) xtpi Scope Going Forward

`xtpi` remains valid as a launcher/publish/cleanup UX layer, but current stable baseline is Pi-first beads flow above.

If/when resumed, xtpi should add convenience only:
- launch into chosen workspace/worktree
- explicit `publish` helper (push + PR create/update, no merge)
- explicit `cleanup` after merge

No wrapper should replace canonical `bd close`.

---

## 7) Success Criteria (Rebased to Current Reality)

- `bd close` remains canonical and drives commit text reuse.
- Memory gate parity with marker acknowledgment works end-to-end.
- Pending memory gate cannot be bypassed via session switch/fork/compact.
- Local iteration remains fast (no forced push-on-close).
- Documentation reflects implemented behavior, not aspirational strict-flow defaults.
