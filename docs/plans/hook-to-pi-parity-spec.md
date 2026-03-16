# Canonical Hook-to-Pi Extension Parity Spec

This specification defines the migration path from Claude Code hooks to Pi Coding Agent extensions for all `xtrm-tools` project skills. 

## 1. `main-guard`

### Current Behavior Contract
- **Trigger:** `PreToolUse` on Claude tools (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Bash`, plus Serena edit tools).
- **Behavior:** Blocks file edits on protected branches (`main`, `master`, plus any configured in `MAIN_GUARD_PROTECTED_BRANCHES`). Blocks `git commit`, `git push`, `git checkout`, `git reset` directly targeting protected branches via `Bash`.
- **Output:** Structured deny message prompting the user to create a feature branch (`git checkout -b feature/...`).

### Target Pi Mapping
- **Pi Event:** `tool_call`
- **Tool Mapping:**
  - `edit`, `write`, `replace_content`, `replace_lines`, `delete_lines`, `insert_at_line`, `create_text_file`
  - `rename_symbol`, `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol`
  - `bash` / `execute_shell_command`
- **Block/Allow Semantics:** Return `{ block: true, reason: string }` when the condition is met. 
- **User Messaging:** Use `ctx.ui.notify(message, "error")` before blocking, so the user sees the explicit branch instruction in the terminal.
- **Timeout/Error Semantics:** Executing `git symbolic-ref` is handled by Pi's subprocess runner (`pi.exec`). On timeout or missing git repo, default to `allow` (fail open).

---

## 2. `using-quality-gates` (formerly `ts-quality-gate` & `py-quality-gate`)

### Current Behavior Contract
- **Trigger:** `PostToolUse` on Claude tools (`Write`, `Edit`, `MultiEdit`).
- **Behavior:** After a file edit, if it's a `.ts`/`.js` file, runs ESLint and `tsc`. If `.py`, runs `ruff` and `mypy`. Can perform autofixes (via `ruff check --fix` or `eslint --fix`). If fatal issues remain, it returns a non-zero exit code to "fail" the tool result so Claude sees the compiler errors.
- **Output:** Standard out is piped back to Claude's context as the tool output.

### Target Pi Mapping
- **Pi Event:** `tool_result`
- **Tool Mapping:** Built-in `edit`, `write`, plus Serena editing tools.
- **Block/Allow Semantics:** `tool_result` allows modifying the result payload *after* the tool executes but *before* the LLM sees it. 
  - If tests pass/autofix succeeds: return `{}` (no change).
  - If linter/type-check fails: return `{ isError: true, content: originalContent + "\n\nLinter Errors:\n" + lintOutput }`.
- **User Messaging:** Use `ctx.ui.notify("Quality gate failed: X errors found", "warning")` for visibility.
- **Timeout/Error Semantics:** Handled via Pi's `exec` with a defined timeout (e.g., 15s).

---

## 3. `service-skills-set`

### Current Behavior Contract
- **SessionStart:** Injects a summarized service catalog into context.
- **PreToolUse:** When reading/editing a territory file, or running bash commands mentioning a service, injects a reminder to load the specific service expert.
- **PostToolUse:** When editing a file in a service territory, detects "drift" (code changed but docs not updated) and issues a warning.

### Target Pi Mapping
- **Pi Events:**
  - **Catalog Injection:** `before_agent_start`. Instead of injecting a synthetic user message, append the catalog directly to the `systemPrompt` (via `return { systemPrompt: event.systemPrompt + "\n\nService Catalog..." }`). This is much more token-efficient and Pi-native.
  - **Territory Activation:** `tool_call` (on `read`, `edit`, `bash`). Check if path matches registry. If yes, we can't inject a message during `tool_call` directly, but we can set a session-scoped state variable and inject a reminder in the next `before_agent_start`, OR we can append the reminder to the *input* of the tool (e.g., modifying the file path to include a comment? No, that breaks. Better: use `ctx.ui.notify` for the user, and if we need the LLM to know, intercept `tool_result` to append a small reminder: "Note: you are in the Auth Service territory, use /skill to load the expert").
  - **Drift Detection:** `tool_result` (on `edit`/`write`). Run the drift check script. If drift detected, append a warning to the `tool_result` content.

---

## 4. `tdd-guard`

### Current Behavior Contract
- **PreToolUse:** Blocks implementation edits (`Write`, `Edit`) if a failing test has not been executed yet in the session.
- **UserPromptSubmit:** Listens for `tdd-guard on/off` commands.
- **SessionStart:** Initializes state.

### Target Pi Mapping
- **Pi Events:**
  - **Commands:** Use Pi's `pi.registerCommand({ name: "tdd", ... })` instead of regex parsing `UserPromptSubmit`.
  - **State Tracking:** Track failing tests by listening to `tool_result` on `bash` commands (looking for test runner output). Store this in a module-level variable or `sessionManager` context.
  - **Enforcement:** `tool_call` (on `edit`/`write`). If state says "no failing test seen", return `{ block: true, reason: "TDD Guard: write a failing test first." }`.
- **User Messaging:** `ctx.ui.notify("TDD Guard blocked implementation", "warning")`.

---

## 5. Incompatibility Register

| Feature | Claude Code Hook | Pi Extension | Adaptation Strategy |
|---------|------------------|--------------|---------------------|
| **Tool Execution Blocking** | `exit 2` | `return { block: true }` | 1:1 map. Cleaner in Pi. |
| **Silent Tool Result Modification** | Standard Out replacement | `return { content: ... }` in `tool_result` | 1:1 map. Better structured in Pi. |
| **Custom CLI Commands** | `UserPromptSubmit` regex match | `pi.registerCommand` | Huge improvement. Migrating `tdd-guard on` to `/tdd on`. |
| **Session State Persistence** | Rely on external files/KV (`bd kv`) | Can use Pi's `ctx.sessionManager` or continue using external DB | Use external DB (`bd`) for cross-session state (like `main-guard` or `beads`), use memory variables for intra-session state (`tdd-guard`). |
| **Synthetic Messages on Load** | `SessionStart` synthetic message | `before_agent_start` `systemPrompt` mutation | Append to system prompt rather than filling context window with synthetic user messages. |

## 6. Acceptance Test Matrix

For each migrated skill, validate:
1. **Interactive Mode:** Ensure `ctx.ui.notify` and `ctx.ui.confirm` fire correctly without crashing.
2. **Non-Interactive / CI Mode:** Ensure `ctx.hasUI` checks prevent hanging on prompts, defaulting to safe actions.
3. **Blocking Correctness:** Ensure returning `{ block: true }` strictly prevents the LLM from executing the tool.
4. **Result Modification:** Ensure `tool_result` patches correctly surface to the LLM (e.g., linter errors are visible).

---
*Signed off by: Dawid Jaggers (2026-03-16)*
*Note: All behavioral changes (e.g., moving `/tdd` to a native command) are intentional improvements over legacy regex scraping.*
