# xtpi Worktree-First Flow Plan

Status: Draft (iteration 1)
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
   - worktree management (`xtpi`) should not be hidden in `bd update --claim`
2. **No accidental writes on `main`**
   - main-guard stays strict for mutating tools/commands
3. **bd remains source of truth for task state**
   - issue claim/close semantics stay clear
4. **Publish and land are distinct**
   - publish PR from sandbox; merge is an explicit gate

---

## 3) Proposed Commands

## `xtpi <name-or-issue>`
- Resolve repo root + default naming
- Ensure worktree exists (create if needed)
- Ensure branch exists/attached (sandbox branch)
- Start `pi` with cwd set to worktree path

## `xtpi resume <name-or-issue>`
- Re-enter existing sandbox worktree and open `pi`

## `xtpi publish`
- From current sandbox worktree:
  - optional commit automation (from bd context)
  - push branch
  - create/update one PR to `main`
- **No merge**

## `xtpi cleanup`
- Remove sandbox worktree after PR is merged (or force with explicit flag)

> Note: `xtrm finish` can either be kept for merge-capable paths, or split/aliased to `xtpi publish` + `xtpi cleanup` in strict mode.

---

## 4) Branch/PR Strategy Options

### Option A: One sandbox branch per issue
- cleanest audit and review boundaries
- more PRs

### Option B: One sandbox branch per session/campaign (multi-issue)
- one final PR
- relies on bd for per-issue traceability
- larger review surface

Initial recommendation: support both, default to **single sandbox branch**, allow multi-issue mode via explicit `--campaign`.

---

## 5) bd Integration Model

- Keep canonical bd DB shared across worktrees (same repository backing)
- `bd update <id> --claim` remains issue ownership, not workspace creation
- Optional helper in `xtpi publish`:
  - derive commit message from recently closed issue(s)
  - enforce closed issue before publish

---

## 6) Guardrails

1. On repo-root `main`: block edits and risky git ops (existing main-guard)
2. In sandbox: allow normal dev flow
3. If claim exists + user is on root: message should point to active sandbox path
4. Prevent accidental merge-to-main in strict `xtpi` mode unless explicit land command/user action

---

## 7) End-to-End Target Flow

1. User/orchestrator: `xtpi jaggers-agent-tools-123`
2. Pi opens in sandbox worktree
3. Agent: `bd update jaggers-agent-tools-123 --claim`
4. Agent works, commits as needed
5. Agent: `xtpi publish` (opens/updates PR, no merge)
6. Human/landing agent merges PR
7. Agent/user: `xtpi cleanup`

---

## 8) Open Questions

1. Should `xtrm finish` remain merge-capable, or become publish/cleanup only under `xtpi` strict mode?
2. Should multi-issue sandbox mode auto-squash commits at publish time?
3. Do we want a dedicated `xtpi land` command, or keep merge outside agent scope?

---

## 9) Rollout Plan

Phase 1
- Add `xtpi` launcher (create/open worktree + exec pi in worktree cwd)
- Keep current claim behavior for compatibility

Phase 2
- Move worktree creation out of claim hook (feature-flagged)
- Keep claim only as issue-state operation

Phase 3
- Add strict mode defaults:
  - publish-only from agent
  - merge gated externally
  - cleanup command

---

## 10) Success Criteria

- Agents no longer start implementation sessions on root `main`
- PR lifecycle is deterministic and explicit
- bd issue state remains reliable across multiple sandboxes
- Fewer guard conflicts and fewer "active worktree" dead-end messages
