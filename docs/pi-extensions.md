---
title: Pi Extensions Reference
scope: pi-extensions
category: reference
version: 1.2.0
updated: 2026-03-22
source_of_truth_for:
  - "config/pi/extensions/**/index.ts"
  - "config/pi/extensions/**/package.json"
domain: [pi, extensions]
---

# Pi Extensions Reference

Pi extensions are stored in `config/pi/extensions/<name>/` and synced to `~/.pi/agent/extensions/<name>/`.

## Install Commands

```bash
xtrm pi install     # non-interactive sync + package install
xtrm pi setup       # interactive first-time setup
xtrm pi status
xtrm pi doctor
xtrm pi reload
```

## Package Format

Each extension is a directory package:

```text
config/pi/extensions/<name>/
  index.ts
  package.json
```

## Active Extensions

- `beads`
- `session-flow`
- `quality-gates`
- `service-skills`
- plus supporting UX/runtime extensions (e.g., `custom-footer`, `xtrm-loader`, `plan-mode`)

## Notes

- Layout is directory-based (not legacy single `.ts` files).
- Policy mappings for runtime-both features are defined in `policies/*.json`.
- Claude hook source-of-truth remains `policies/*.json` → `hooks/hooks.json`.

## Related Docs

- [XTRM-GUIDE.md](XTRM-GUIDE.md)
- [policies.md](policies.md)
- [hooks.md](hooks.md)
