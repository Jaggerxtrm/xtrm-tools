# Config Manager CLI Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an interactive, smart `npx` tool to automate the installation, synchronization, and management of `jaggers-agent-tools` configurations.

**UX Philosophy:** "Scan, Plan, Execute". Minimize user friction by pre-calculating necessary changes and offering safe bulk actions.

**Architecture:**
- Node.js CLI located in `cli/` directory.
- **Smart Context:** Auto-detection of Claude/Gemini config paths.
- **Diff Engine:** Compare Repo vs. System state before asking.
- **Safe Config:** Use AST-based JSON editing to preserve comments in `settings.json`.
- **Persistence:** Remember user preferences (Symlink vs Copy) between runs.

**Tech Stack:**
- Runtime: Node.js
- UI: `prompts`, `kleur`
- Utils: `fs-extra`, `os`, `path`
- Logic: `conf` (preferences), `comment-json` (settings editor)

---

### Task 1: Initialize CLI Project

**Files:**
- Create: `cli/package.json`
- Create: `cli/index.js` (Entry point)
- Create: `.gitignore` (Update to ignore `cli/node_modules`)

**Step 1: Create `cli/package.json`**

Initialize a new package with `type: module`.
Dependencies: `prompts`, `kleur`, `fs-extra`, `minimist`, `conf`, `comment-json`.

**Step 2: Create basic entry point**

Create `cli/index.js` with a "Hello World" to verify setup.

**Step 3: Update root .gitignore**

Add `cli/node_modules` to the root `.gitignore`.

**Step 4: Verify execution**

Run: `cd cli && npm install && node index.js`

---

### Task 2: Smart Context & Preferences

**Files:**
- Create: `cli/lib/context.js`
- Modify: `cli/index.js`

**Step 1: Path Detection Logic**

Implement logic to find the active agent config directory.
- Check `CLAUDE_CONFIG_DIR` env var.
- Check standard paths: `~/.claude`, `~/.gemini`, `~/.config/claude`, `%APPDATA%\Claude`.
- If multiple found, prompt user once and save choice.

**Step 2: Preference Management**

Use `conf` to store:
- `targetDir`: The selected config path.
- `syncMode`: "symlink" (dev) or "copy" (user).

**Step 3: Integration**

On launch, load context. If missing, run the "First Run Wizard".

---

### Task 3: Scan & Diff Engine

**Files:**
- Create: `cli/lib/diff.js`
- Modify: `cli/index.js`

**Step 1: Implement `scanState`**

Compare `repo/skills` & `repo/hooks` against `system/skills` & `system/hooks`.
Generate a `ChangeSet` object containing:
- `missing`: In repo, not in system.
- `outdated`: In system, but repo is newer (based on version/content).
- `drifted`: In system, modified locally (newer than repo).
- `orphaned`: In system, not in repo (optional, low priority).

**Step 2: Display Summary**

Instead of asking file-by-file, print a summary table:
"Found 3 new skills, 1 hook update, 1 local modification."

---

### Task 4: Unified Sync UI

**Files:**
- Create: `cli/lib/sync.js`
- Modify: `cli/index.js`

**Step 1: Bulk Actions**

Present the user with high-level actions based on the Diff:
- **[Recommended] Sync All**: Install missing + Update outdated.
- **Backport**: Copy local drifts back to repo.
- **Selective**: Choose specific items.

**Step 2: Execution Logic**

Implement `executePlan(changeSet, mode)`:
- If `mode === 'symlink'`: Create symlinks for missing/outdated.
- If `mode === 'copy'`: Copy files (with `fs-extra`).
- Handle "Backport" (System -> Repo copy).

---

### Task 5: Auto-Config Injection

**Files:**
- Create: `cli/lib/config-injector.js`
- Modify: `cli/index.js`

**Step 1: AST-based JSON Editing**

Use `comment-json` to read `settings.json`.
- Preserve existing comments!
- Check if `hooks` section exists.
- Check if specific hooks (e.g., `skill-suggestion.sh`) are registered.

**Step 2: Safe Injection Flow**

- If hooks are missing, prompt: "Inject hook configuration automatically? (Backup will be created)".
- **Backup**: `settings.json` -> `settings.json.bak`.
- **Write**: Update the file structure safely.

---

### Task 6: Final Polish & Documentation

**Files:**
- Modify: `README.md`
- Modify: `cli/package.json`

**Step 1: Add `bin` entry**

Make the CLI globally executable.

**Step 2: Update README**

Documentation for:
- `npx` usage.
- Symlink vs Copy explanation.
- Troubleshooting.

**Step 3: Final End-to-End Verification**

Run the full flow on a clean test environment.