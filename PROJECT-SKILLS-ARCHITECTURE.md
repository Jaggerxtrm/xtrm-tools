# XTRM-Tools: Project Skills & Hooks Architecture Spec

## 1. Overview & Motivation
This specification defines the new architecture for managing, synchronizing, and installing AI agent tools, skills, and hooks across environments. 

Previously, `xtrm-tools` attempted to manage and auto-translate hooks for multiple CLI agents (Claude Code, Gemini CLI, Qwen CLI). However, the hook ecosystem in Gemini and Qwen is fragile, undocumented, and unofficially supported. Attempting to maintain a wrapper that translates Claude's hook format to others introduces significant technical debt.

**Decision:** `xtrm-tools` will natively support and automate hook installations **ONLY for Claude Code**. For Gemini and Qwen, users must manually configure their environments. The CLI will focus on providing a robust, modular, "Plug & Play" installation engine for project-specific tools (Project Skills).

## 2. Completed Work (Phase 1)
- **Skill Creator Update:** Removed outdated `skill-creator` directories across the system and replaced them with the official, full-featured `skill-creator` plugin from Anthropic's registry (including evaluator agents, scripts, and viewer).
- **Hook Development Skill:** Extracted the `hook-development` skill from Anthropic's `plugin-dev` marketplace. 
- **Advanced Hook Patterns:** Enriched `hook-development` references with real-world patterns:
  - Added OS Notification (AppleScript/notify-send) pattern.
  - Added Agent-based and HTTP webhook patterns.
  - Added a high-performance **Quality Gate / Linting** pattern (TypeScript/ESLint caching checker) ported from a community repository (`quality-check.js`), solving the "fast feedback loop" requirement for `PostToolUse` hooks.
- **Security Disclaimers:** Added explicit "Security Considerations" and "USE AT YOUR OWN RISK" disclaimers to the `hook-development` skill, as arbitrary shell execution is inherently risky.

## 3. Pending Work (Phase 2): CLI Refactoring

### 3.1 Remove Multi-Agent Hook Translation
- Strip out the automated hook translation logic for Gemini and Qwen in `cli/src/utils/config-adapter.ts` (e.g., `transformToGeminiHooks`, mapping `PreToolUse` -> `BeforeTool`).
- Update the main `README.md` to document this architectural decision. Provide manual setup instructions for Gemini/Qwen users.

### 3.2 The New `xtrm` CLI
The executable name will be changed to `xtrm` (via `package.json` bin).
Commands will be restructured for semantic clarity:
- `xtrm install`: Global installation (syncs skills, global hooks, and config to `~/.claude`, `~/.agents`, etc.). Replaces the current `sync` command default behavior.
- `xtrm install project <tool-name>`: Local installation of a specific modular tool package into the current working directory.

### 3.3 The "Plug & Play" Project Skills Engine
The `cli/src/commands/install-service-skills.ts` file currently hardcodes the installation of the "Service Skills Trinity". This will be refactored into a generic `install-project-skill` engine.

**Directory Standard for a Project Skill:**
To add a new tool (e.g., `tdd-guard`), a developer simply creates a folder in `xtrm-tools/project-skills/<tool-name>/` matching this structure:
```text
project-skills/<tool-name>/
├── README.md                 (Required: Documentation for the user)
└── .claude/
    ├── settings.json         (Optional: Hooks to inject)
    └── skills/
        └── using-<tool-name>/ (Optional: Skill to give the agent context)
            └── SKILL.md
```

**Installation Logic (`xtrm install project <tool-name>`):**
1. **Validation:** Check if `project-skills/<tool-name>` exists.
2. **Hook Injection:** If `.claude/settings.json` exists in the package, read it and perform a **deep merge** with the target project's local `.claude/settings.json`. It must intelligently append hooks (e.g., to `PreToolUse`) without overwriting existing user hooks (similar to the logic verified in `unit.ai-specialists/bin/install.js`).
3. **Skill Copy:** Copy the contents of `.claude/skills/` into the target project's `.claude/skills/` directory.
4. **Documentation Copy:** Copy `README.md` (and other docs) into the target project (e.g., `.claude/docs/<tool-name>-readme.md`) for easy user reference.
5. **Post-Install Guidance:** Print a colorized, informative message. Since many tools (like TDD Guard) require language-specific setup (e.g., installing `tdd-guard-vitest` via npm), the CLI **must** instruct the user to read the copied README for the final manual steps.

## 4. Case Study: Integrating `tdd-guard`
TDD Guard enforces Test-Driven Development by blocking agent implementation code until a failing test is written.

It requires a two-part setup:
1. **The Guard (Claude Hooks):** Intercepts `Write|Edit` tools and runs the global `tdd-guard` CLI command.
2. **The Reporter (Project Code):** A language-specific test reporter (e.g., `tdd-guard-vitest`, `tdd-guard-pytest`) installed as a dev dependency that saves test results to a JSON file.

**Integration Strategy:**
- `xtrm-tools` will *only* automate Part 1. 
- We will structure the `tdd-guard` folder in `project-skills/tdd-guard/` according to the standard above.
- `.claude/settings.json` will contain the `PreToolUse`, `UserPromptSubmit`, and `SessionStart` hooks pointing to the `tdd-guard` command.
- The `README.md` will contain the multi-language setup instructions for Part 2.
- Upon running `xtrm install project tdd-guard`, the CLI configures Claude's infrastructure and explicitly warns the user: *"TDD Guard hook installed. You MUST now install the language-specific test reporter. Read .claude/docs/tdd-guard-readme.md for instructions."*
