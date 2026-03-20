# Unified Workflow Plan (Claude + Pi + Specialists)

Status: Active
Owner issue: `jaggers-agent-tools-xepd`

## 1) Naming + CLI (decided)

- **Canonical CLI:** `xtrm`
- **Alias:** `xt`
- `xtpi` is not the primary user-facing direction anymore.

## 2) Command structure (decided)

### Global
- `xt init`
- `xt status`
- `xt doctor`
- `xt install [all|basic|pi|claude|specialists]`

### Runtime-specific
- `xt pi <install|status|doctor|reload>`
- `xt claude <install|status|doctor|reload>`

### Specialists
- `xt sp list`
- `xt sp run <specialist> --prompt "..."`
- `xt sp status [job-id]`
- `xt sp result <job-id>`
- `xt sp stop <job-id>`
- Reserved shorthand: `xt @<specialist> "<prompt>"`

## 3) Core workflow contract (shared Claude + Pi)

Canonical loop remains beads-first:

```bash
bd update <id> --claim
# implement
bd close <id> --reason "..."
```

Rules:
1. `bd update --claim` = ownership only.
2. `bd close --reason` = canonical close action.
3. Close reason may be reused for auto-commit message in runtime session-flow.
4. Push/PR/merge are explicit external steps by default.
5. No `xt` wrapper replaces canonical `bd close`.

## 4) Beads in Worktrees (explicit mechanism)

This section is mandatory for agent/worktree correctness.

1. **Single canonical beads backing store**
   - All worktrees for a repository must read/write the same canonical `.beads` database for that repo.
   - Worktree changes do not create isolated issue trackers.

2. **Claim visibility across worktrees**
   - A claim created in one worktree (`bd update <id> --claim`) must be visible from any sibling worktree of the same repo.
   - Orchestration/tools must not rely on per-worktree hidden state as source of truth for issue ownership.

3. **Session key behavior**
   - Session-scoped keys (`claimed:<sessionId>`, `closed-this-session:<sessionId>`) remain runtime/session-local markers.
   - They support edit/memory gates, but canonical issue truth is still `bd` issue status/ownership.

4. **Switch/re-entry expectations**
   - Re-entering a different worktree must preserve access to the same issue graph (`bd list/show/ready` parity).
   - If session markers are missing after re-entry, user may need to re-claim for that runtime session, but issue history/state must remain consistent.

5. **Specialists integration guardrail**
   - `xt sp`/specialists jobs must attach to the same canonical beads context and must not fork a second tracker state.
   - Specialist output should reference issue IDs/job IDs so traceability is preserved across worktrees.

## 5) Current implemented behavior

- Claim-time worktree bootstrap removed.
- Pi close-driven auto-commit is active (`<close_reason> (<id>)`), no-op if clean.
- Memory marker flow parity is active (`touch .beads/.memory-gate-done`).
- Pending memory gate is enforced in Pi on mutating tools and `session_before_*` transitions.
- Main-guard policy wiring is removed from active runtime.

## 6) Claude/Pi parity model

Same behavioral contract, different enforcement surfaces:
- Claude: hook lifecycle (`PreToolUse`, `PostToolUse`, `Stop`, ...)
- Pi: extension lifecycle (`tool_call`, `tool_result`, `agent_end`, `session_before_*`, ...)

## 7) Specialists complement boundary

- **xtrm/xt owns:** runtime gates, session flow, close/memory semantics.
- **specialists owns:** delegated execution/orchestration, background jobs, specialist lifecycle.

Integration rule: specialists must integrate with beads context/output, but not redefine canonical close semantics.

## 8) Known follow-ups

- `jaggers-agent-tools-ycg9` (P2): TS quality-gate false negative.
- Session-end active-claim warning may need throttling.

## 9) Success criteria

- One shared workflow model for Claude + Pi.
- CLI namespace settled (`xtrm` canonical, `xt` alias, `xt sp` specialists).
- `bd close` remains canonical.
- Memory gate marker flow is consistent and enforceable.
