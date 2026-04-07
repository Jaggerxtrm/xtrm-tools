---
name: specialists-creator
description: >
  Use this skill when creating or fixing a specialist definition. It guides the
  agent through writing a valid `.specialist.json`, choosing supported models,
  validating against the schema, and avoiding common specialist authoring
  mistakes.
version: 1.1
synced_at: 9648ffae
---

# Specialist Author Guide

> Source of truth: `src/specialist/schema.ts` | Runtime: `src/specialist/runner.ts`

---

## ACTION REQUIRED BEFORE ANYTHING ELSE

Run these commands **right now**, before reading further, before writing any JSON, before doing anything else:

```bash
pi --list-models
```

Read the output. Pick one primary model and one fallback from **different providers**. Then ping both:

```bash
pi --model <chosen-primary>  --print "ping"    # must print: pong
pi --model <chosen-fallback> --print "ping"    # must print: pong
```

If a ping fails, pick the next best model in that tier and ping again. **Do not proceed until both return "pong".**

Model tiers:
- **Heavy** (deep reasoning, multi-phase): Opus / Pro / GLM-5
- **Standard** (authoring, review, codegen): Sonnet / Flash-Pro
- **Light** (fast context, reports, tests): Haiku / Flash

Rules:
- Always pick the **highest version** in a family (`claude-sonnet-4-6` not `4-5`, `gemini-3.1-pro-preview` not `gemini-2.5-pro`)
- `model` and `fallback_model` must be **different providers**
- Never write a model string you have not pinged in this session

---

## Model Setup (for a new specialist OR "setup my specialists models")

### Quick Reference: Specialists CLI

```bash
specialists list                              # all specialists + current model
specialists models                            # all pi models, flagged with thinking/images, shows current assignments
specialists edit <name> --model <value>       # change primary model
specialists edit <name> --fallback-model <v> # change fallback model
specialists edit <name> --model <v> --dry-run # preview without writing
specialists edit <name> --permission HIGH     # change permission level
specialists status                            # system health
specialists doctor                            # prereq + hook diagnostics
```

---

### Scenario: "Setup my specialists models"

When a user asks to set up or re-balance specialist models, run this workflow:

#### Step 1 — Inventory

```bash
specialists list       # shows each specialist + its current model
specialists models     # shows all available models on pi, with current assignments marked ←
```

Read both outputs carefully:
- `specialists list` → what specialists exist and what they currently use
- `specialists models` → what models are available, and which specialists already use each one (the `←` markers show assignments)

#### Step 2 — Classify each specialist by tier

| Tier | Specialists (typical) | Recommended model class |
|------|-----------------------|------------------------|
| **Heavy** — deep reasoning, multi-phase, architecture | `overthinker`, `feature-design`, `bug-hunt`, `planner`, `parallel-review` | Opus / Pro / GLM-5 |
| **Standard** — code generation, review, authoring, docs | `codebase-explorer`, `specialist-author`, `sync-docs`, `xt-merge` | Sonnet / Flash-Pro |
| **Light** — fast context, reporting, test runs | `init-session`, `report-generator`, `test-runner` | Haiku / Flash |

Adjust tiers based on what the user actually has installed. Custom specialists: read their `description` and `permission_required` to infer tier.

#### Step 3 — Select models with provider diversity

Rules:
1. **Pick the highest version in each family** — `glm-5` not `glm-4.7`, `claude-sonnet-4-6` not `4-5`, `gemini-3.1-pro-preview` not `gemini-2.5-pro`
2. **`model` and `fallback_model` must be different providers** — never stack two anthropic models
3. **Spread providers across tiers** — don't assign all specialists to anthropic; distribute across anthropic / google-gemini-cli / zai / openai-codex where available
4. **Match thinking capability to tier** — heavy specialists benefit from `thinking: yes` models

Example distribution (based on current `specialists models` output):

| Tier | model | fallback_model |
|------|-------|----------------|
| Heavy | `anthropic/claude-opus-4-6` | `google-gemini-cli/gemini-3.1-pro-preview` |
| Standard | `anthropic/claude-sonnet-4-6` | `google-gemini-cli/gemini-3-flash-preview` |
| Light | `anthropic/claude-haiku-4-5` | `zai/glm-5-turbo` |

If anthropic is not available, use `zai/glm-5` (heavy), `google-gemini-cli/gemini-3.1-pro-preview` (standard), `google-gemini-cli/gemini-3-flash-preview` (light).

#### Step 4 — ⛔ Ping each chosen model before assigning

```bash
# REQUIRED — do not skip, do not assume a model works without pinging
pi --model <provider>/<primary-model-id>  --print "ping"   # must return "pong"
pi --model <provider>/<fallback-model-id> --print "ping"   # must return "pong"
```

Ping **both** primary and fallback. If ping fails → pick next best in that tier and ping again. Do not assign a model that did not respond.

#### Step 5 — Apply with `specialists edit`

```bash
# Example: upgrade heavy-tier specialists
specialists edit overthinker     --model anthropic/claude-opus-4-6     --fallback-model google-gemini-cli/gemini-3.1-pro-preview
specialists edit feature-design  --model anthropic/claude-opus-4-6     --fallback-model google-gemini-cli/gemini-3.1-pro-preview
specialists edit bug-hunt        --model anthropic/claude-opus-4-6     --fallback-model google-gemini-cli/gemini-3.1-pro-preview

# Standard tier
specialists edit codebase-explorer --model anthropic/claude-sonnet-4-6 --fallback-model google-gemini-cli/gemini-3-flash-preview
specialists edit sync-docs         --model anthropic/claude-sonnet-4-6 --fallback-model google-gemini-cli/gemini-3-flash-preview

# Light tier
specialists edit init-session    --model anthropic/claude-haiku-4-5    --fallback-model zai/glm-5-turbo
specialists edit report-generator --model anthropic/claude-haiku-4-5   --fallback-model zai/glm-5-turbo
```

Use `--dry-run` first to preview any change before writing.

#### Step 6 — Verify

```bash
specialists list    # confirm all models updated correctly
specialists models  # confirm assignments look balanced
```

---

### For a new specialist (single model selection)

> **See [⛔ MANDATORY FIRST STEP](#-mandatory-first-step--verify-models-before-writing-any-json) at the top of this skill.**
> Use `pi --list-models` (not `specialists models`) to discover models, ping both before writing JSON.

```bash
# 1. pi --list-models            — see exactly what's available on pi right now
# 2. Pick tier + pick highest version in family
# 3. pi --model <primary>  --print "ping"   — must return "pong"
# 4. pi --model <fallback> --print "ping"   — must return "pong"
# 5. Write JSON with verified model strings
```

**Rule:** Never hardcode a model without pinging it. If ping fails, try the next best in that tier.

---

## JSON Format Notes

- All string enum values must be quoted: `"READ_ONLY"`, `"auto"`, `"markdown"`
- Version must be a quoted string: `"1.0.0"` not `1.0.0`
- Multi-line strings use `\n` for newlines in `task_template`
- Comments are not supported in JSON — use `//` in a separate `.md` doc if needed
- Use a JSON formatter/linter to catch syntax errors before validation

---

## Quick Start: Minimal Skeleton

```json
{
  "specialist": {
    "metadata": {
      "name": "my-specialist",
      "version": "1.0.0",
      "description": "One sentence.",
      "category": "workflow"
    },
    "execution": {
      "model": "anthropic/claude-sonnet-4-6",
      "permission_required": "READ_ONLY"
    },
    "prompt": {
      "task_template": "$prompt\n\nWorking directory: $cwd"
    }
  }
}
```

Validate before committing:
```bash
bun src/specialist/validate.ts specialists/my-specialist.specialist.json
```

---

## Schema Reference

> **Note:** YAML format is deprecated. All new specialists must use `.specialist.json`.

### `specialist.metadata` (required)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | kebab-case: `[a-z][a-z0-9-]*` |
| `version` | string | yes | semver: `"1.0.0"` (quoted string in JSON) |
| `description` | string | yes | One sentence |
| `category` | string | yes | Free text (e.g. `"workflow"`, `"analysis"`, `"codegen"`) |
| `author` | string | no | Optional |
| `created` | string | no | Optional date |
| `updated` | string | no | Optional date |
| `tags` | string[] | no | Optional list |

### `specialist.execution` (required)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `model` | string | — | required — ping before using |
| `fallback_model` | string | — | must be a different provider |
| `mode` | enum | `"auto"` | `"tool"` \| `"skill"` \| `"auto"` |
| `timeout_ms` | number | `120000` | milliseconds |
| `stall_timeout_ms` | number | — | kill if no event for N ms |
| `interactive` | boolean | `false` | enable multi-turn keep-alive by default |
| `response_format` | enum | `"text"` | `"text"` \| `"json"` \| `"markdown"` |
| `permission_required` | enum | `"READ_ONLY"` | see tier table below |
| `thinking_level` | enum | — | `"off"` \| `"minimal"` \| `"low"` \| `"medium"` \| `"high"` \| `"xhigh"` |

**When to use `execution.interactive`**

- Set `interactive: true` for specialists intended for multi-turn workflows (`resume`, iterative planning, long investigations).
- Leave it unset/`false` for one-shot specialists where each run should end immediately.
- Run-level overrides still apply:
  - CLI: `--keep-alive` enables, `--no-keep-alive` disables.
  - MCP `start_specialist`: `keep_alive` enables, `no_keep_alive` disables.
- Effective precedence: explicit disable (`--no-keep-alive` / `no_keep_alive`) → explicit enable (`--keep-alive` / `keep_alive`) → `execution.interactive` → one-shot default.

**Permission tiers** — controls which pi tools are available:

| Level | pi --tools | Use when |
|-------|-----------|----------|
| `READ_ONLY` | `read,grep,find,ls` | Read-only analysis, no bash |
| `LOW` | `+bash` | Inspect/run commands, no file edits |
| `MEDIUM` | `+edit` | Can edit existing files |
| `HIGH` | `+write` | Full access — can create new files |

**Common pitfall:** `READ_WRITE` is **not** a valid value — use `LOW` or higher.

### `specialist.prompt` (required)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `task_template` | string | yes | Template string with `$variable` substitution |
| `system` | string | no | System prompt / agents.md content |
| `skill_inherit` | string | no | Single skill folder/file injected via `pi --skill` (Agent Forge compat) |
| `output_schema` | object | no | JSON schema for structured output — injected into system prompt by runner; post-run validation is warn-only |
| `examples` | array | no | Few-shot examples |

**`output_schema` guidance**: Add when the specialist's output should be machine-readable by downstream consumers (mesk handoff, pipeline injection). The schema is injected as an instruction into the system prompt — the agent structures its output accordingly. Use `response_format: "markdown"` alongside it for human-readable output with a machine-readable block at the end.

Standard schemas by specialist type:

```json
// executor — change manifest
"prompt": {
  "output_schema": {
    "type": "object",
    "properties": {
      "status": { "enum": ["success", "partial", "failed"] },
      "files_changed": { "type": "array", "items": { "type": "string" } },
      "symbols_modified": { "type": "array", "items": { "type": "string" } },
      "lint_pass": { "type": "boolean" },
      "tests_pass": { "type": "boolean" },
      "issues_closed": { "type": "array", "items": { "type": "string" } },
      "follow_ups": { "type": "array", "items": { "type": "string" } }
    }
  }
}

// explorer — analysis report
"prompt": {
  "output_schema": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "key_files": { "type": "array", "items": { "type": "string" } },
      "architecture_notes": { "type": "string" },
      "recommendations": { "type": "array", "items": { "type": "string" } }
    }
  }
}

// planner — epic result
"prompt": {
  "output_schema": {
    "type": "object",
    "properties": {
      "epic_id": { "type": "string" },
      "children": { "type": "array", "items": { "type": "string" } },
      "test_issues": { "type": "array", "items": { "type": "string" } },
      "first_task": { "type": "string" }
    }
  }
}
```

### `specialist.skills` (optional)

```json
"skills": {
  "paths": [
    "skills/my-skill/",
    "~/.agents/skills/domain/",
    "skills/notes.md"
  ],
  "scripts": [
    {
      "run": "./scripts/pre-check.sh",
      "phase": "pre",
      "inject_output": true
    },
    {
      "run": "bd ready",
      "phase": "pre",
      "inject_output": true
    },
    {
      "run": "./scripts/cleanup.sh",
      "phase": "post"
    }
  ]
}
```

`run` accepts either a **file path** (`./scripts/foo.sh`, `~/scripts/foo.sh`) or a **shell command** (`bd ready`, `git status`). Pre-run validation checks that file paths exist and shell commands are on `PATH`. Shebang typos (e.g. `pytho` instead of `python`) are caught and reported as errors before the session starts.

`path` is accepted as a deprecated alias for `run`.

### `specialist.capabilities` (optional)

Informational declarations used by pre-run validation and future tooling (e.g. `specialists doctor`).

```json
"capabilities": {
  "required_tools": ["bash", "read", "grep", "glob"],
  "external_commands": ["bd", "git", "gh"]
}
```

`external_commands` causes a hard failure if any binary is not found on `PATH` — the session will not start.

### `specialist.output_file` (optional, top-level)

```json
"output_file": ".specialists/my-specialist-result.md"
```

Writes the final session output to this file path after the session completes. Relative to the working directory.

### `specialist.communication` (optional)

```json
"communication": {
  "next_specialists": "planner"
}
// or an array:
"communication": {
  "next_specialists": ["planner", "test-runner"]
}
```

`next_specialists` declares which specialist(s) should receive this specialist's output as `$previous_result`. Chaining is executed by the caller (e.g. `run_parallel` pipeline) — this field is declarative metadata.

### `specialist.validation` (optional)

Drives the staleness detection shown in `specialists status` and `specialists list`.

| Field | Type | Notes |
|-------|------|-------|
| `files_to_watch` | string[] | Paths to monitor. If any file's mtime is newer than `metadata.updated`, the specialist is marked **STALE** |
| `stale_threshold_days` | number | If the specialist has been STALE for more than N days, escalates to **AGED** |
| `references` | array | Accepted, currently unused |

**Staleness states:**

| State | Condition |
|-------|-----------|
| `OK` | No watched files changed, or no `files_to_watch` / `updated` set |
| `STALE` | A watched file's mtime > `metadata.updated` |
| `AGED` | STALE + days since `updated` > `stale_threshold_days` |

```json
{
  "specialist": {
    "metadata": {
      "updated": "2026-03-01"
    },
    "validation": {
      "files_to_watch": [
        "src/specialist/schema.ts",
        "src/specialist/runner.ts"
      ],
      "stale_threshold_days": 30
    }
  }
}
```

This specialist goes STALE the moment `schema.ts` or `runner.ts` is modified after March 1st, and AGED if that condition persists for more than 30 days.

### `specialist.stall_detection` (optional)

Controls stall detection warnings during specialist execution.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `running_silence_warn_ms` | number | `60000` | Warn if no events for N ms while running |
| `running_silence_error_ms` | number | `300000` | Mark stale if no events for N ms while running |
| `waiting_stale_ms` | number | `3600000` | Warn if waiting state lasts N ms |
| `tool_duration_warn_ms` | number | `120000` | Warn if single tool runs longer than N ms |

```json
"stall_detection": {
  "running_silence_warn_ms": 60000,
  "running_silence_error_ms": 300000,
  "waiting_stale_ms": 3600000,
  "tool_duration_warn_ms": 120000
}
```

### `specialist.beads_integration` (optional)

| Value | Behavior |
|-------|----------|
| `"auto"` (default) | Create tracking bead when permission_required is LOW+ |
| `"always"` | Always create a tracking bead |
| `"never"` | Never create a tracking bead |

---

## Built-in Template Variables

These are **always available** in `task_template` — no configuration needed:

| Variable | Value |
|----------|-------|
| `$prompt` | The user's prompt passed to `use_specialist` |
| `$cwd` | `process.cwd()` at invocation time |
| `$pre_script_output` | Stdout of `pre` scripts with `inject_output: true` (empty string if none) |

**When invoked via `--bead`** (inputBeadId present):

| Variable | Value |
|----------|-------|
| `$bead_context` | Full bead content (replaces `$prompt`) |
| `$bead_id` | The bead ID |

**Custom variables** can be passed at invocation time via `--variables key=value` and accessed as `$key`.

---

## Skills Injection (`skills.paths`)

Files listed under `skills.paths` are read and appended to the system prompt at runtime:

```json
"skills": {
  "paths": [
    "skills/specialist-author/SKILL.md",
    ".claude/agents.md"
  ]
}
```

Each file is appended as:
```
---
# Skill: <path>

<file content>
```

Missing files are silently skipped (no error).

`skill_inherit` (in `prompt:`) works the same way but for a single file — it is an Agent Forge compatibility field, appended under `# Service Knowledge`.

---

## Pre/Post Scripts

Scripts run **locally** (not inside the agent session):

```json
"skills": {
  "scripts": [
    {
      "run": "scripts/gather-context.sh",
      "phase": "pre",
      "inject_output": true
    },
    {
      "run": "scripts/notify.sh",
      "phase": "post",
      "inject_output": false
    }
  ]
}
```

- `pre` scripts run before the agent session starts; use `inject_output: true` to surface their stdout.
- `post` scripts run after the session completes (cleanup, notifications).
- Timeout: 30 seconds per script.
- Exit code is captured but does not abort the run.

---

## Annotated Full Example

```json
{
  "specialist": {
    "metadata": {
      "name": "code-reviewer",
      "version": "1.0.0",
      "description": "Reviews a PR diff for correctness, style, and security issues.",
      "category": "code-quality",
      "author": "team@example.com",
      "updated": "2026-03-22",
      "tags": ["review", "code-quality", "security"]
    },
    "execution": {
      "mode": "tool",
      "model": "anthropic/claude-sonnet-4-6",
      "fallback_model": "google-gemini-cli/gemini-3.1-pro-preview",
      "timeout_ms": 300000,
      "stall_timeout_ms": 60000,
      "interactive": true,
      "response_format": "markdown",
      "permission_required": "READ_ONLY"
    },
    "prompt": {
      "system": "You are an expert code reviewer. Focus on correctness, maintainability, and security.\nDo NOT modify any files -- output a markdown review only.",
      "task_template": "Review the following changes:\n\n$prompt\n\n$pre_script_output\n\nWorking directory: $cwd\n\nOutput a structured markdown review with sections: Summary, Issues, Suggestions.",
      "skill_inherit": "skills/code-review/guidelines.md"
    },
    "skills": {
      "paths": ["skills/code-review/"],
      "scripts": [
        {
          "run": "scripts/get-diff.sh",
          "phase": "pre",
          "inject_output": true
        }
      ]
    },
    "capabilities": {
      "required_tools": ["bash", "read"],
      "external_commands": ["git"]
    },
    "communication": {
      "next_specialists": ["sync-docs"]
    },
    "output_file": ".specialists/review.md",
    "beads_integration": "auto"
  }
}
```

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Must be kebab-case` | `name` has uppercase or spaces | Use `"my-specialist"` not `"MySpecialist"` |
| `Must be semver` | `version: "v1.0"` or unquoted `1.0.0` | Use `"version": "1.0.0"` (quoted string, no `v` prefix) |
| `Invalid enum value ... 'READ_WRITE'` | Wrong permission value | Use `"READ_ONLY"`, `"LOW"`, `"MEDIUM"`, or `"HIGH"` |
| `Invalid enum value ... 'auto'` on permission_required | Using `"auto"` for permission_required | `"auto"` is only valid for `beads_integration` |
| `Required` on `task_template` | `task_template` missing from `prompt` | Add `task_template` (even if just `"$prompt"`) |
| `Required` on `model` | `model` missing from `execution` | Add a model string |
| `Required` on `description` | Missing `description` in `metadata` | Add description string |
| `Required` on `category` | Missing `category` in `metadata` | Add category string |
| JSON parse error | Invalid JSON syntax (missing comma, trailing comma, unquoted keys) | Run through a JSON linter; all keys and string values must be quoted |
| Silently ignored / no output | JSON valid but `task_template` doesn't use `$prompt` | Add `$prompt` to `task_template` |
| `defaults` key unrecognized | Using `defaults` top-level key | Remove it; use `--variables` at invocation or built-ins |

---

## File Placement

Specialists are discovered from three scopes (highest priority first):

1. **Project**: `<project-root>/specialists/*.specialist.json`
2. **User**: `~/.agents/specialists/*.specialist.json`
3. **System**: package-bundled specialists

Name your file `<metadata.name>.specialist.json`.

> **Deprecated:** `.specialist.yaml` files are still supported but will print a deprecation warning. Migrate to `.specialist.json`.

---

## Validation Workflow

Use the built-in `specialists validate` command or the schema validator directly.

```bash
# 1. MANDATORY: discover + ping models (see top of this skill)
pi --list-models
pi --model <provider>/<primary-model-id>  --print "ping"   # must return "pong"
pi --model <provider>/<fallback-model-id> --print "ping"   # must return "pong"

# 2. Write the JSON with the verified model strings

# 3. Validate schema (option A: CLI command)
specialists validate specialists/my-specialist.specialist.json

#    OR (option B: direct schema validator)
bun src/specialist/validate.ts specialists/my-specialist.specialist.json

# 4. List to confirm discovery
specialists list

# 5. Smoke test
specialists run my-specialist --prompt "ping" --no-beads
```

The validator uses `parseSpecialist()` from `src/specialist/schema.ts` which validates against the Zod schema and provides field-by-field error messages.
