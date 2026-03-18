# Design: `install-service-skills` CLI Subcommand

**Date:** 2026-03-04
**Status:** Approved

## Goal

Enable installing the Service Skill Trinity into any project via npx, without requiring Python or a manual script invocation:

```sh
cd my-project
npx github:<owner>/jaggers-agent-tools install-service-skills
```

## Context

- The main CLI (`jaggers-config`) is invoked via `npx github:<owner>/jaggers-agent-tools` and handles sync/status/reset.
- The service-skills installer currently lives as a standalone Python script (`project-skills/service-skills-set/install-service-skills.py`) that must be run manually.
- The goal is to expose the same functionality as a TypeScript Commander subcommand inside the existing CLI.

## Architecture

### New file

`cli/src/commands/install-service-skills.ts` — TypeScript port of the Python installer, registered in `src/index.ts`.

### Path resolution

The compiled CJS output is at `cli/dist/index.cjs`, so `__dirname` = `<package-root>/cli/dist/` in both local and npx-from-GitHub contexts. Source assets are resolved as:

```ts
const PKG_ROOT = path.resolve(__dirname, '../..');
const SKILLS_SRC = path.join(PKG_ROOT, 'project-skills', 'service-skills-set', '.claude');
```

This works identically whether run locally or from the npx temp cache.

### Steps executed by the command

1. **Detect target project git root** — `git rev-parse --show-toplevel` from `process.cwd()`. Abort if the result equals the jaggers-agent-tools package root (guard against running inside the tool repo itself).
2. **Copy 4 skills** — `fs-extra.copy` each of `creating-service-skills`, `using-service-skills`, `updating-service-skills`, `scoping-service-skills` from `SKILLS_SRC/<skill>` → `<target>/.claude/skills/<skill>/`. Overwrites on re-run (idempotent).
3. **Merge settings.json hooks** — Read (or create) `<target>/.claude/settings.json`, non-destructively add the three hook blocks (SessionStart, PreToolUse, PostToolUse). Existing keys are preserved with a `○ already present` notice.
4. **Install git hooks** — Write marker-guarded snippets into `<target>/.githooks/pre-commit` (doc-reminder) and `<target>/.githooks/pre-push` (skill-staleness), then copy into `.git/hooks/` and chmod 755.

The git hook scripts referenced in the snippets point to `<target>/.claude/skills/...`, so no back-reference to the jaggers-agent-tools package is needed at runtime.

### Output style

Matches existing CLI conventions: kleur colors, `✓`/`○` status markers, section headers, boxed summary at the end.

## Files Changed

| File | Change |
|------|--------|
| `cli/src/commands/install-service-skills.ts` | New — full installer logic |
| `cli/src/index.ts` | Register new subcommand |

## Non-Goals

- No changes to the Python script (kept for backward compatibility).
- No new npm package / separate binary entry.
- No changes to `sync`, `status`, `reset`, or `add-optional` commands.
