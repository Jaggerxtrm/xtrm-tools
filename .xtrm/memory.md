# Project Memory — xtrm-tools
_Updated: 2026-04-03 | Bootstrapped for tracking — run `xt memory update` to synthesize_

## Do Not Repeat
- ❌ Write memory.md with old section headings (Architecture & Decisions / Non-obvious Gotchas / Process & Workflow Rules) → ✅ Use the 3 canonical sections: Do Not Repeat / How This Project Works / Active Context

## How This Project Works
- `.xtrm/memory.md` is injected as system prompt at session start — write only directive/imperative guidance, not descriptive prose.
- `xt memory update` runs the memory-processor specialist to synthesize bd memories + session reports into this file; run it after any significant session to keep context fresh.
- This file is user-owned (`USER_OWNED_PATHS`): `xt install --force` will never overwrite it.

## Active Context
- Bootstrapped scaffold — run `xt memory update` to populate with real session context from bd memories and session reports.
