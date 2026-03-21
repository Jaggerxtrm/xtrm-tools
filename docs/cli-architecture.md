---
title: CLI Architecture
scope: cli-architecture
category: reference
version: 1.1.0
updated: 2026-03-21
source_of_truth_for:
  - "cli/src/**/*.ts"
domain: [cli]
---

# CLI Architecture

This document maps the module structure of `cli/src/` and explains how the
major pieces fit together. Read this before modifying install/sync logic.

## Entry Point

`cli/src/index.ts` registers all subcommands via Commander:

```
xt / xtrm
├── install          → commands/install.ts
├── install all      → commands/install.ts
├── claude           → commands/claude.ts  → utils/worktree-session.ts
├── pi               → commands/pi.ts      → utils/worktree-session.ts
├── worktree         → commands/worktree.ts
├── end              → commands/end.ts
├── init             → commands/init.ts
├── clean            → commands/clean.ts
├── status           → commands/status.ts
├── docs             → commands/docs.ts
│   └── docs show    → displays frontmatter for README, CHANGELOG, docs/*.md
└── help             → commands/help.ts
```

`xtrm finish` was removed in v0.5.x — `commands/finish.ts` and
`core/xtrm-finish.ts` are dead code kept for reference only.

---

## Install Flow (`xtrm install`)

```
createInstallCommand()          commands/install.ts
  │
  ├── runPreflight()            core/preflight.ts
  │     ├── getCandidatePaths() — discovers Claude/Pi/Gemini/.agents targets
  │     ├── calculateDiff()     core/diff.ts        (per target, in parallel)
  │     ├── loadCanonicalMcpConfig()                (core + optional MCP servers)
  │     └── → PreflightPlan { targets[], optionalServers[], repoRoot, syncMode }
  │
  ├── renderPlanTable()         commands/install.ts — pretty-prints the plan
  ├── interactive-plan prompts  core/interactive-plan.ts — confirm/select targets
  │
  ├── syncMcpForTargets()       core/sync-executor.ts
  │     └── syncMcpServersWithCli() — registers MCP servers via agent CLI
  │
  └── executeSync()             core/sync-executor.ts  (per target)
        ├── skills/  → copy repo/skills/* → target/skills/*
        ├── hooks/   → copy repo/hooks/*  → target/hooks/*
        └── config/settings.json
              ├── filterHooksByInstalledScripts()
              ├── adapter.adaptHooksConfig()         utils/config-adapter.ts
              ├── safeMergeConfig()                  utils/atomic-config.ts
              │     └── deepMergeWithProtection()    (PROTECTED_KEYS guard)
              └── atomicWrite()                      (backup → write → cleanup)
```

---

## Module Reference

### `core/preflight.ts`

**`runPreflight(repoRoot, prune?): Promise<PreflightPlan>`**

Scans all candidate install targets in parallel. For each found target:
- detects agent type via `detectAdapter()`
- runs `calculateDiff()` to classify files as `missing` / `outdated` / `drifted`
- loads canonical MCP server list

Returns the full `PreflightPlan` used by the install command to render the
plan table, prompt for confirmation, and feed into `executeSync`.

### `core/diff.ts`

**`calculateDiff(repoRoot, systemRoot, pruneMode?): Promise<ChangeSet>`**

Compares repo state against installed state. Each file is classified into one
of three buckets:

| Status | Meaning |
|---|---|
| `missing` | File is in repo but not installed |
| `outdated` | Repo has changed since last install (repo hash ≠ manifest hash) |
| `drifted` | User modified the installed file (installed hash ≠ manifest hash) |

Reads `.jaggers-sync-manifest.json` at the target for the `fileHashes` map.
Falls back to mtime comparison when no manifest exists.

Special case: `~/.agents/skills` target maps `repo/skills/*` directly to the
target root (no `skills/` subdirectory at destination).

### `core/sync-executor.ts`

**`syncMcpForTargets(repoRoot, targets, isDryRun?, selectedMcpServers?): Promise<number>`**

Syncs MCP servers to each unique agent type. Deduplicates by agent so
Claude + Gemini pointing at the same binary are only synced once. Called
**before** `executeSync` in the install command.

**`executeSync(repoRoot, systemRoot, changeSet, mode, actionType, isDryRun?, options?): Promise<number>`**

Core install engine. Processes `missing` + `outdated` items from the
`changeSet` across `skills`, `hooks`, and `config` categories:

- **skills / hooks**: plain file copy (or symlink if `mode=symlink`)
- **config/settings.json**: special path — merges into existing config via
  `safeMergeConfig` rather than overwriting
- After each file: records repo hash into manifest `fileHashes`
- On any failure: rolls back all backups created in this run

`actionType`:
- `sync` — repo → system (normal install)
- `backport` — system → repo (pull user changes back to source)

`mode`:
- `copy` — standard file copy
- `symlink` — symlink instead of copy (skipped on Windows)
- `prune` — also removes `drifted` files; replaces hook events wholesale

### `core/manifest.ts`

Reads and writes `.jaggers-sync-manifest.json` at the install target:

```json
{
  "lastSync": "2026-03-20T12:00:00Z",
  "repoRoot": "/home/user/projects/xtrm-tools",
  "items": 12,
  "fileHashes": {
    "hooks/main-guard.mjs": "<sha256>",
    "skills/delegating/SKILL.md": "<sha256>"
  }
}
```

`fileHashes` keys are `<category>/<name>`. The hash is taken from the **repo**
file at install time. `calculateDiff` uses these to distinguish `outdated`
(repo changed) from `drifted` (user changed).

### `utils/atomic-config.ts`

**`safeMergeConfig(localConfigPath, repoConfig, options?): Promise<MergeResult>`**

Merges `repoConfig` into the existing local config file. Never clobbers:
uses `deepMergeWithProtection` then writes atomically via `atomicWrite`.

**`deepMergeWithProtection(original, updates, currentPath?, opts?): any`**

Deep merge with three special cases:

1. **PROTECTED_KEYS** (`hooks.PreToolUse`, `hooks.SessionStart`,
   `hooks.UserPromptSubmit`) — skipped if already present in local config.
   This prevents `xtrm install` from overwriting user hook customisations.

2. **`hooks` object** — merged by command identity (additive). In
   `pruneHooks` mode, xtrm-managed wrappers are replaced wholesale while
   user-local hooks (commands not under `~/.claude/hooks/`) are preserved.

3. **`mcpServers`** — additive only: new servers from repo are added, but
   existing local servers are never removed.

**`atomicWrite(filePath, data, options?)`**

Writes JSON with an optional backup. Preserves comment-json comments when
`preserveComments: true`.

**`isProtectedPath(keyPath)`** / **`getProtectedKeys()`**

Returns the list of key paths that `deepMergeWithProtection` will never
overwrite. Known limitation: this means `xtrm install` is additive-only for
those keys — stale hook entries accumulate until `xtrm clean`.

### `utils/config-adapter.ts`

**`ConfigAdapter`** — Claude Code–only adapter. Handles:
- resolving `~` and `$HOME` in hook command paths to the actual install dir
- adapting `hooks.json` event names to Claude's schema

### `adapters/registry.ts`

**`detectAdapter(systemRoot)`** — sniffs the install target path to identify
the agent type (`claude-code`, `gemini`, `qwen`, etc.). Used by `calculateDiff`
and `executeSync` to apply agent-specific logic.

### `utils/sync-mcp-cli.ts`

**`syncMcpServersWithCli(agent, mcpConfig, isDryRun, remove?)`**

Registers MCP servers by invoking the agent's own CLI (e.g. `claude mcp add`)
rather than writing config files directly. This is the preferred path for
agents whose CLI manages MCP state.

**`loadCanonicalMcpConfig(repoRoot, optional?)`**

Reads `config/mcp.json` (core) or `config/mcp-optional.json` (optional
servers) from the repo. The `_notes` field on each server entry carries
`description`, `prerequisite`, `install_cmd` — shown in the preflight UI.

### `utils/repo-root.ts`

**`findRepoRoot()`** — walks up from `cwd` to find the nearest `.git` or
`.beads` directory. Used by all commands to locate `repoRoot` at runtime.

### `core/rollback.ts`

Lightweight backup/restore helpers used by `executeSync`. Creates timestamped
`.bak` copies before overwriting files. Cleaned up on success; restored on
failure.

### `utils/hash.ts`

**`hashFile(path)`** / **`hashDirectory(path)`** — SHA-256 hashes used by
`calculateDiff` to compare repo vs installed file content.

---

## Key Types (`types/config.ts`, `types/models.ts`)

```typescript
// One bucket per category returned by calculateDiff
interface ChangeSetCategory {
    missing:  string[];   // in repo, not installed
    outdated: string[];   // repo changed since last install
    drifted:  string[];   // user modified the installed copy
    total:    number;
}

interface ChangeSet {
    skills:  ChangeSetCategory;
    hooks:   ChangeSetCategory;
    config:  ChangeSetCategory;
    commands: ChangeSetCategory;
    // ... agent-specific categories
}

// One entry per install target (e.g. ~/.claude, ~/.gemini)
interface TargetPlan {
    target:    string;      // absolute path
    label:     string;      // human label
    agent:     string|null; // 'claude-code' | 'gemini' | 'qwen' | null
    files:     FileItem[];  // flattened view of the ChangeSet
    mcpCore:   McpItem[];
    changeSet: ChangeSet;
}

interface PreflightPlan {
    targets:         TargetPlan[];
    optionalServers: OptionalServerItem[];
    repoRoot:        string;
    syncMode:        'copy' | 'symlink' | 'prune';
}
```

---

## Adding a New Install Category

1. Add source dir to `cli/src/` (e.g. `config/pi/`)
2. Add category key to `ChangeSet` in `types/config.ts`
3. Add detection logic in `calculateDiff` (`core/diff.ts`)
4. Add copy logic in `executeSync` (`core/sync-executor.ts`)
5. Update `getCandidatePaths` in `core/preflight.ts` if a new target dir is needed
