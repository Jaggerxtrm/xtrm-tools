Completed. I applied the final cleanup for plugin-era infrastructure and validated the key checks.

### ✅ Removed directories
Deleted from repo:
- `plugins/` (including `plugins/xtrm-tools/...`)
- `.claude-plugin/`

### ✅ Audited and cleaned plugin-path/runtime references in `cli/src`
I ran the requested audits and cleaned remaining references, including:
- `cli/src/core/init-verification.ts`  
  - Reworked Claude runtime verification to validate `.xtrm/hooks` wiring in `.claude/settings.json` instead of plugin install state.
- `cli/src/utils/worktree-session.ts`  
  - Removed `installed_plugins.json` usage and plugin registration logic.
  - Statusline now resolves from worktree-local `.xtrm/hooks/statusline.mjs`.
- `cli/src/commands/claude.ts`  
  - Updated install/reload/status/doctor messaging and checks to hook-wiring model (no `claude plugin list` flow).
- `cli/src/commands/skills.ts`  
  - Removed `CLAUDE_PLUGIN_ROOT` fallback.
- `cli/src/commands/help.ts`, `cli/src/commands/init.ts`  
  - Updated phase/help text to hook wiring.
- `cli/src/tests/policy-parity.test.ts`  
  - Removed `CLAUDE_PLUGIN_ROOT` literal usage from command resolution helper.

### ✅ Additional required fix for build after deletion
- Updated `scripts/sync-cli-version.mjs` to stop reading/writing deleted plugin manifests (`.claude-plugin/...`, `plugins/xtrm-tools/...`).

### ✅ Docs updated
- `CLAUDE.md` updated to describe `.xtrm` layout and hook wiring into `.claude/settings.json`.
- `AGENTS.md` updated with explicit “Claude hook wiring (current model)” section.
- Files remain separate (not merged).

---

## Validation results

### Requested grep checks
- `grep -r "plugins/" cli/src/ --include="*.ts"` → no matches
- `grep -r "claude-plugin|\\.claude-plugin" cli/src/ --include="*.ts"` → no matches
- `grep -r "plugin install|plugin marketplace" cli/src/ --include="*.ts"` → no matches
- `grep -r "installed_plugins" . --include="*.ts" --include="*.mjs"` → no matches

### Acceptance grep
- `grep -r "CLAUDE_PLUGIN_ROOT|plugins/xtrm-tools|installed_plugins" cli/src/` → no matches

### Build/typecheck
- `npm run build` → ✅ succeeds
- `npm run typecheck` → ❌ fails due existing unrelated strict TS issues outside this cleanup scope (same pre-existing family: `prompts` typings, `preflight/context/debug` typing issues).

---

Bead workflow also completed:
- Claimed bead already existed
- Saved memory + ack
- Closed `xtrm-gl8b.9` with completion reason