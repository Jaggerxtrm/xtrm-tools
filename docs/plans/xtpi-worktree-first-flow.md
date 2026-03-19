# xtpi Worktree-First Flow Plan

Status: Draft (iteration 2 — ready decisions only)
Owner issue: `jaggers-agent-tools-xepd`

## 1) Goal

Create an `xtpi` launcher workflow where agents never start on repo-root `main` for implementation work.

Target behavior:
- `xtpi <issue-or-sandbox>` creates/opens a dedicated worktree
- launches `pi` directly in that worktree
- day-to-day work stays sandboxed
- PR merge to `main` is an explicit external/landing step (not implicit)

---

## 2) Design Principles

1. **Workspace lifecycle is separate from issue lifecycle**
   - Worktree management (`xtpi`) should not be hidden in `bd update --claim`
2. **No accidental writes on `main`**
   - main-guard stays strict for mutating tools/commands
3. **bd remains source of truth for task state**
   - issue claim/close semantics stay canonical
4. **Publish and land are distinct**
   - publish PR from sandbox; merge is an explicit gate

---

## 3) Proposed Commands (target)

### `xtpi <name-or-issue>`
- Resolve repo root + default naming
- Ensure worktree exists (create if needed)
- Ensure branch exists/attached (sandbox branch)
- Start `pi` with cwd set to worktree path

### `xtpi resume <name-or-issue>`
- Re-enter existing sandbox worktree and open `pi`

### `xtpi publish`
- From current sandbox worktree:
  - verify clean/dirty state policy
  - ensure branch is pushed
  - create/update one final PR to `main`
- **No merge**

### `xtpi cleanup`
- Remove sandbox worktree after PR is merged (or force with explicit flag)

### `xtrm finish` (deprecation target)
- **Deprecated in xtpi strict workflow**
- Replacement path is `xtpi publish` + external merge + `xtpi cleanup`

---

## 4) Branch/PR Strategy Options

### Option A: One sandbox branch per issue
- cleanest audit and review boundaries
- more PRs

### Option B: One sandbox branch per session/campaign (multi-issue)
- one final PR
- relies on bd for per-issue traceability
- larger review surface

Current default direction: support both; keep default behavior configurable and confirm after practical validation.

---

## 5) bd Integration Model (ready decision)

- Keep canonical bd DB shared across worktrees (same repository backing)
- `bd update <id> --claim` remains issue ownership, not workspace creation
- `bd close` stays the canonical issue-closing command (no workflow fork to `xtpi close`)
- Add **post-close automation** triggered by successful `bd close`:
  1. read closed issue id + `close_reason` (`bd show <id> --json`)
  2. if sandbox branch has changes: `git add -A && git commit -m "<close_reason> (<id>)"`
  3. if no changes: no-op (do not fail `bd close`)

### Push policy
- **Default: no push on close**
  - keeps local iteration fast
  - avoids noisy remote history while issue work is still evolving
- Optional setting: `xtpi.autoPushOnClose=true` for immediate remote backup
- `xtpi publish` is the canonical "push + create/update final PR" step

---

## 6) Guardrails

1. On repo-root `main`: block edits and risky git ops (existing main-guard)
2. In sandbox: allow normal dev flow
3. If claim exists + user is on root: message should point to active sandbox path
4. In xtpi strict workflow: disallow merge-to-main from development session commands

---

## 7) End-to-End Target Flow

1. User/orchestrator: `xtpi jaggers-agent-tools-123`
2. Pi opens in sandbox worktree
3. Agent: `bd update jaggers-agent-tools-123 --claim`
4. Agent works and closes issues with `bd close --reason "..."`
5. Post-close automation creates local commit message from `close_reason` (default: no push)
6. Agent runs `xtpi publish` (push + create/update final PR, no merge)
7. Human/landing agent merges PR
8. Agent/user runs `xtpi cleanup`

---

## 8) Open Questions (still open)

1. Naming decision: keep `xtrm` umbrella, add `xt` alias, or migrate to `xt`?
2. Should campaign mode support an optional squash-at-publish helper?
3. Do we need a separate `land` command, or keep merge fully external?
4. Should `bd remember` trigger behavior be restored/updated as part of xtpi rollout or tracked as a separate bugfix stream?

---

## 9) Rollout Plan

Phase 1
- Add `xtpi` launcher (create/open worktree + exec pi in worktree cwd)
- Keep current claim behavior for compatibility during transition

Phase 2
- Move worktree creation out of claim hook (feature-flagged)
- Keep claim only as issue-state operation
- Introduce `xtrm finish` deprecation messaging in strict xtpi mode

Phase 3
- Enforce strict mode defaults:
  - publish-only from agent
  - merge gated externally
  - cleanup command required
- Fully deprecate `xtrm finish` in xtpi-managed workflow docs

---

## 10) Success Criteria

- Agents no longer start implementation sessions on root `main`
- `bd close` remains canonical while commit text is reused automatically
- PR lifecycle is deterministic and explicit (publish vs merge vs cleanup)
- bd issue state remains reliable across multiple sandboxes
- Fewer guard conflicts and fewer "active worktree" dead-end messages
