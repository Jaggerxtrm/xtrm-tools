Done — I made targeted doc updates (no restructuring) for all three requested changes.

### Updated files

- `README.md`
  - Updated skills install behavior: optional packs are now populated by default via `xt install`, activation via `xt skills enable <pack>`.
  - Added new default skills in catalogs: `deepwiki`, `specialists-creator`, `using-specialists`.
  - Updated version references and added `0.7.1` row in Version History.

- `CHANGELOG.md`
  - Updated `v0.7.1` entry (dated `2026-04-02`) with explicit bullets for:
    - optional pack install behavior docs update,
    - `@xtrm/pi-core` symlink path docs update,
    - new default skills docs update.

- `docs/skills.md`
  - Updated optional tier wording to reflect auto-population by `xt install` and activation via `xt skills enable <pack>`.
  - Added `using-specialists`, `specialists-creator`, `deepwiki` to skill catalogs.

- `docs/skills-tier-architecture.md`
  - Updated optional tier source/activation semantics.
  - Added new default skills mention in baseline examples.

- `docs/skills-registry-exploration.md`
  - Updated optional/extra tier population note: auto-populated by `xt install`, explicitly activated with `xt skills enable <pack>`.

- `docs/cli-architecture.md`
  - Updated `xt skills list` behavior wording to reflect pre-populated optional directories + explicit runtime activation.

- `docs/pi-extensions.md`
  - Added `@xtrm/pi-core` resolution path:
    - new: `.xtrm/extensions/node_modules/@xtrm/pi-core`
    - legacy `.pi/node_modules/@xtrm/pi-core` marked retired.

- `docs/xtrm-directory.md`
  - Updated directory layout to include `.xtrm/extensions/node_modules/@xtrm/pi-core` symlink.
  - Updated optional packs note to indicate default population during `xt install`.

- `docs/XTRM-GUIDE.md`
  - Updated `xt skills enable <pack>` command description to activation semantics.
  - Added note about optional pack auto-population by `xt install`.
  - Added Pi core symlink resolution path note.

Also: bead `xtrm-y0d7` was claimed and closed with memory ack.