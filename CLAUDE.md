<!-- xtrm:start -->
# XTRM Agent Workflow (Short)

This file is an **agent operating manual** (not a project overview).

1. **Start with scope**
   - Clarify task intent if ambiguous.
   - Prefer semantic discovery (Serena + GitNexus) over broad grep-first exploration.

2. **Track work in `bd`**
   - Use `bd ready --json` / `bd update <id> --claim --json` before edits.
   - Create discovered follow-ups with `--deps discovered-from:<id>`.

3. **Branch per issue (strict)**
   - Create a **new branch for each issue** from latest `main`.
   - Do **not** continue new work on a previously used branch.
   - Branch format: `feature/<issue-id>-<short-description>` (or `fix/...`, `chore/...`).

4. **Edit safely**
   - Use Serena symbol tools for code changes when possible.
   - Run GitNexus impact checks before symbol changes and detect-changes before commit.

5. **PR merge + return to main**
   - Always merge via PR (squash merge preferred).
   - After merge: switch to `main` and sync (`git reset --hard origin/main`).
   - Delete merged branch locally and remotely (`git branch -d <branch>` and `git push origin --delete <branch>`).

6. **Before finishing**
   - Run relevant tests/linters.
   - Close/update bead state.
   - Ensure changes are committed and pushed.
<!-- xtrm:end -->

# Claude Code Guide for Jaggers Agent Tools

## Architecture
- **Skills**: stored in `skills/`. Each skill has `SKILL.md` and optional `README.md`.
- **Hooks**: stored in `hooks/`. Python scripts (`.py`) for lifecycle events.
- **Config**: stored in `config/`. `settings.json` template.
- **CLI**: stored in `cli/`. Node.js tool for installation and sync.
- **Documentation**: stored in `docs/` and `.serena/memories/` (SSOT).

## CI/CD
- **GitHub Actions**: Workflows in `.github/workflows/ci.yml`.
- **Validation**:
  - `npm run lint`: Lint Node.js (Eslint) and Python (Ruff).
  - `npm test`: Run global test suite.
  - `pytest skills/documenting/tests`: Run documenting skill tests.

## Development Environment
- **Runtime**: Node.js (CLI), Python 3.8+ (Hooks/Scripts)
- **Dependencies**:
  - CLI: `npm install` in `cli/`
  - Python: Standard library only (no external deps for hooks)

## Key Files & Directories
- `cli/lib/sync.js`: Logic for syncing/backporting configurations. Includes dynamic path resolution for hardcoded repo paths.
- `cli/lib/transform-gemini.js`: Logic for transforming Claude config to Gemini.
- `skills/orchestrating-agents/`: Multi-agent orchestration skill with parameter support.
  - `SKILL.md`: Skill definition with `gemini-args` for workflow type selection.
  - `references/handover-protocol.md`: CLI resume flags (Gemini: `-r latest`, Qwen: `-c`).
  - `references/workflows.md`: Multi-turn workflow protocols (Collaborative, Adversarial, Troubleshoot).

## Gemini Support
- The CLI automatically detects `~/.gemini` environments.
- **Slash Commands**: Specialized commands available: `/orchestrate`, `/delegate`, `/document`, `/prompt`.
  - `/orchestrate` supports workflow parameters: `/orchestrate [collaborative|adversarial|troubleshoot|handshake] "task"`
- **Command Sync**: Syncs custom slash commands from `.gemini/commands/`.
- **Auto-Command Generation**: Automatically transforms `SKILL.md` into Gemini `.toml` command files during sync.
  - Supports `gemini-args` for parameterized commands with choice/string types.
- **Path Resolution**: Fixes hardcoded paths in `settings.json` templates by dynamically resolving them to the user's target installation directory.
- `settings.json` is dynamically transformed for Gemini compatibility:
  - Event names mapped (UserPromptSubmit -> BeforeAgent)
  - Paths rewritten to target directory
  - Unsupported fields filtered out

### Multi-Agent CLI Flags
- **Gemini**: Use `-r latest` or `-r <index>` to resume sessions (not `--resume`)
- **Qwen**: Use `-c` or `--continue` to resume most recent session

### Documentation
- `export PYTHONPATH=$PYTHONPATH:$(pwd)/skills/documenting && python3 skills/documenting/scripts/orchestrator.py . feature "desc" --scope=skills --category=docs`
- `python3 skills/documenting/scripts/generate_template.py` - Create memory

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **xtrm-tools** (3509 symbols, 9691 relationships, 257 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/xtrm-tools/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/xtrm-tools/context` | Codebase overview, check index freshness |
| `gitnexus://repo/xtrm-tools/clusters` | All functional areas |
| `gitnexus://repo/xtrm-tools/processes` | All execution flows |
| `gitnexus://repo/xtrm-tools/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->
