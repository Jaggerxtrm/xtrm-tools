# Skills tree invariants (schema v1)

These invariants are enforced by `cli/src/core/skill-discovery.ts` and are the
contract for runtime rebuild/materialization layers.

## Directory model

- `default/<skill>/SKILL.md`
- `optional/<pack>/PACK.json` + direct child skill dirs
- `user/packs/<pack>/PACK.json` + direct child skill dirs
- `active/{claude,pi}/` runtime materialization targets
- `state.json` runtime enablement source of truth

## Enforced checks

1. **Direct skill detection only**
   - A skill is only a direct child directory with `SKILL.md`.
   - Nested `SKILL.md` files do not register as skills.

2. **Mutual exclusivity**
   - A directory cannot be both skill and pack (`SKILL.md` XOR `PACK.json`).

3. **No nested runtime roots in skill trees**
   - Skill directories must not contain `.claude/`, `.agents/`, or `.pi/`.

4. **Pack metadata validation**
   - `PACK.json` is validated (schema/name consistency).
   - Filesystem skill directories remain authoritative for the effective skill list.

5. **Pack metadata drift reporting**
   - Metadata-only skills and filesystem-only skills are reported as mismatches.

6. **Pack identity collisions**
   - Optional and user packs cannot share the same pack name.
