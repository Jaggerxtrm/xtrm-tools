# Eval 14: edge-case-mixed-language-project

**Prompt:** I have a monorepo with both TypeScript backend and Python ML services. How do quality gates work?

**Skill Applied:** using-quality-gates

---

## Response (with skill active)

In a **mixed-language monorepo**, Quality Gates work independently per file type:

### File-Type Routing

| File Extension | Active Gate |
|----------------|-------------|
| `.ts`, `.tsx`, `.js`, `.jsx` | TypeScript Quality Gate |
| `.py` | Python Quality Gate |
| `.go`, `.rs`, `.php` | TDD Guard only (no language-specific quality gate) |
| `.md`, `.txt`, `.json` | No gate (documentation/config) |

### TDD Guard (All Code Files)

TDD Guard applies to **all code files** regardless of language:
- TypeScript backend tests → `tdd-guard-jest` or `tdd-guard-vitest`
- Python ML tests → `tdd-guard-pytest`
- Both reporters can coexist in the same project

### Quality Gates (Language-Specific)

**TypeScript Backend** (`packages/backend/`):
```bash
npm install --save-dev typescript eslint prettier
# PostToolUse hook runs: tsc + eslint + prettier
```

**Python ML Services** (`packages/ml-service/`):
```bash
pip install ruff mypy
# PostToolUse hook runs: ruff check + ruff format + mypy
```

### Configuration

Each language has separate config:
- TS: `.claude/hooks/hook-config.json`
- Python: Environment variables (`CLAUDE_HOOKS_RUFF_ENABLED`, etc.)

### Your Workflow

```
Edit TypeScript file → TDD Guard check → TS Quality Gate
Edit Python file     → TDD Guard check → PY Quality Gate
```

Both gates coexist peacefully — each only activates for its file types.

---

**Result:** ✅ Explains coexistence, file-type routing, separate reporters
