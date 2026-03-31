# Skills Registry Exploration Spec (bead: xtrm-s3pf)

Source of truth: specialist explorer output from job `48ec83`.

## 1) Current architecture analysis and pain points

### Current distribution model

Today, skills are effectively distributed through multiple channels:

- Canonical source in repository `skills/`
- Project-local and/or global copied installs (for example `.agents/skills/`)
- Claude plugin-bundled skill assets
- Pi runtime extension-driven skill injection paths

This creates a hybrid of copy-based and bundle-based behavior rather than a single, runtime-resolved registry.

### Runtime behavior snapshot

- **Claude runtime** primarily consumes plugin-bundled assets and hook-injected prompts.
- **Pi runtime** can load via filesystem-based extension logic and is capable of symlink-aware behavior.
- **Project-local installs** are generally static snapshots from install-time copy/merge actions.

### Pain points

1. **Duplication:** same skill content exists in multiple places.
2. **Drift risk:** copied artifacts can diverge from upstream canonical skill content.
3. **Upgrade friction:** updates require re-install or re-sync choreography across runtimes.
4. **Asymmetric runtime behavior:** Claude vs Pi have different operational constraints.
5. **Complex support matrix:** global/local/worktree + plugin/runtime interactions increase failure modes.
6. **Copy-based installs hinder idempotency:** repeated installs can produce unexpected local differences without robust manifests.

---

## 2) Architecture options

## Option A — Plugin-first

Keep Claude plugin packaging as the primary distribution authority, with runtime installs following plugin asset conventions and selective symlink/copy support where possible.

### Option A strengths

- Lower short-term disruption.
- Leverages existing plugin packaging flows.
- Potentially faster to roll out with minimal runtime contract change.

### Option A weaknesses

- Retains plugin-coupled distribution.
- Does not fully solve duplicate source/copy drift.
- Keeps asymmetry between Claude plugin behavior and Pi runtime behavior.
- Less flexible for future per-project pack activation and overlays.

## Option B — Runtime-registry-first (recommended)

Make `.xtrm/skills` + registry metadata the canonical runtime source. Both Claude and Pi resolve active skills from a shared registry model; runtime-specific loaders adapt behavior.

### Option B strengths

- True single source of truth for enabled/available skills.
- Stronger idempotency and auditability through manifests.
- Better extensibility for packs/profiles/overlays.
- Cleaner long-term architecture across global, local, and worktree workflows.

### Option B weaknesses

- Higher implementation effort initially.
- Requires plugin/runtime integration changes.
- Needs robust fallback paths for environments with symlink limits.

### Tradeoffs table

| Dimension | Option A: Plugin-first | Option B: Runtime-registry-first |
|---|---|---|
| Initial implementation effort | Lower | Higher |
| Long-term architecture clarity | Medium | High |
| Drift resistance | Medium | High |
| Claude/Pi parity | Lower | Higher |
| Optional packs/profiles growth | Moderate | Strong |
| Idempotent install behavior | Moderate | Strong |
| Worktree friendliness | Moderate | High |
| Future maintainability | Moderate | High |

---

## 3) Compatibility matrix

Matrix covers: **Pi runtime / Claude plugin / global install / project-local / git worktree** against each option.

| Surface / Mode | Option A: Plugin-first | Option B: Runtime-registry-first |
|---|---|---|
| Pi runtime | Works well; can use symlink/copy fallback | Works well; registry-native loader + fallback |
| Claude plugin | Native fit (bundle-driven) | Requires registry-aware plugin/runtime bridge |
| Global install | Supported; may still duplicate artifacts | Supported; centralized registry with cleaner state |
| Project-local install | Supported; more copy/merge behavior | Supported; local registry scope allows clearer ownership |
| Git worktree | Works but can inherit copy drift | Strong fit; worktree-scoped registry state is explicit |

### Platform caveat (both options)

- **Windows symlink permissions** can force copy fallback; architecture must treat this as first-class behavior, not error-only edge case.

---

## 4) `xt skills` CLI contract (minimum)

Required baseline contract:

```bash
xt skills list [--global|--local]
xt skills enable <pack> [--global|--local]
xt skills disable <pack> [--global|--local]
xt skills profile <name> [--global|--local]
```

### Semantics

- `--global`: operate on user/global registry scope.
- `--local`: operate on project-local registry scope.
- If no scope flag is provided, CLI should use deterministic default resolution (documented precedence).

### Contract expectations

- Commands are **idempotent**.
- Mutating commands return structured status including:
  - target scope
  - effective action (`enabled`, `already-enabled`, `disabled`, etc.)
  - any fallback mode (`symlink` vs `copy`)
- `profile` returns active profile composition and resolved skill packs for the selected scope.

---

## 5) Migration plan for existing copy-based installs

Goal: transition safely from copy-based installs to registry-driven behavior with idempotency and rollback.

## Phase v0.8 — Foundation

- Introduce registry metadata and inventory commands.
- No breaking runtime behavior change.
- Preserve existing copy-based paths.
- Add detection of legacy copy installs and map them into registry inventory.

## Phase v0.9 — Dual-mode bridge

- Enable registry-driven resolution while supporting existing copy installs.
- Attempt symlink mode where supported; fallback to copy mode when not.
- Maintain manifest of resolved mode per target.

## Phase v1.0 — Registry-first

- Runtime-registry-first becomes default behavior.
- Copy mode remains fallback/compatibility path.
- CLI operates as authoritative control plane for enable/disable/profile.

### Idempotency guarantees

1. Re-running install/sync yields the same effective state.
2. `enable` on already-enabled pack is a no-op with explicit status.
3. `disable` on already-disabled pack is a no-op with explicit status.
4. Registry writes are atomic (temp file + rename pattern).
5. Manifest hashes prevent unnecessary rewrites and expose drift.

### Rollback strategy

- Pre-migration snapshot of prior skill state + registry metadata.
- Per-phase reversible migration markers.
- One-command rollback restores previous copy/symlink topology and registry snapshot.
- Rollback must preserve user-authored local overlays.

---

## 6) Risks and open questions

### A) Windows symlink permissions

- Non-admin/dev-mode environments may block symlink creation.
- Required behavior: deterministic copy fallback + visibility in command output.

### B) Claude plugin lifecycle constraints

- Plugin packaging/loading lifecycle may limit direct dynamic path resolution.
- Open question: exact boundary between plugin-bundled assets vs runtime-registry reads.

### C) npm `postinstall` reliability

- `postinstall` behavior can vary by environment and installer flags.
- Critical migration steps should not rely solely on implicit postinstall execution.
- Prefer explicit CLI reconciliation commands for deterministic repair.

### Additional open questions

- Scope precedence when both global and local states exist.
- Worktree inheritance model for shared vs isolated registry state.
- Policy for user-modified managed skills (overlay vs in-place drift).

---

## 7) Recommendation

Adopt **Option B: runtime-registry-first**, with phased rollout:

- **v0.8:** registry foundation + read/listing + compatibility detection.
- **v0.9:** dual-mode operation (registry + legacy copies), symlink-first with safe fallback.
- **v1.0:** registry-first default across runtimes with mature CLI controls.

Rationale:

- Best long-term reduction of drift and duplication.
- Better operational transparency across global/local/worktree installs.
- Provides clean control surface via `xt skills` contract.
- Supports backward compatibility while creating a clear migration runway.

---

## Appendix: concise decision summary

- Keep backward compatibility during rollout.
- Treat Windows symlink fallback as normal mode.
- Avoid hard dependency on `postinstall` for critical convergence.
- Establish registry + manifest as the canonical state machine.
- Use CLI contract as the single user-facing control plane.
