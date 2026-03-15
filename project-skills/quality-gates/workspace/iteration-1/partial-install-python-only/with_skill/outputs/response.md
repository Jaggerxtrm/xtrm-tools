# Eval 4: partial-install-python-only

**Prompt:** I'm working on a Python-only project with pytest. What quality tools should I install?

**Skill Applied:** using-quality-gates

---

## Response (with skill active)

For a **Python-only project**, you need the following quality tools:

### Required Installation

```bash
# 1. TDD Guard CLI (global install)
npm install -g tdd-guard

# 2. TDD Guard pytest reporter (project install)
pip install tdd-guard-pytest

# 3. Python Quality Gate tools
pip install ruff mypy
```

### Configure TDD Guard Reporter

Add to your `pyproject.toml` or `conftest.py`:

**Option A: pyproject.toml**
```toml
[tool.pytest.ini_options]
tdd_guard_project_root = "/absolute/path/to/your/project"
```

**Option B: conftest.py**
```python
# conftest.py
from tdd_guard_pytest import PytestReporter

def pytest_configure(config):
    config.option.tdd_guard_project_root = "/absolute/path/to/your/project"
```

### Configure Quality Gate

Set environment variables (in `.bashrc`, `.zshrc`, or project `.env`):

```bash
export CLAUDE_HOOKS_RUFF_ENABLED=true
export CLAUDE_HOOKS_MYPY_ENABLED=true
export CLAUDE_HOOKS_AUTOFIX=true
```

### Create Configuration Files

**ruff.toml** or **pyproject.toml**:
```toml
[tool.ruff]
line-length = 88
target-version = "py38"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "N", "UP", "B", "C4"]
```

**mypy.ini**:
```ini
[mypy]
python_version = 3.8
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = False
ignore_missing_imports = True
```

### Your Python-Only Workflow

```
1. Write failing test (pytest)
   ↓
2. TDD Guard validates test exists
   ↓
3. Implement feature
   ↓
4. Ruff + Mypy validate quality (auto-fix applied)
   ↓
5. pytest confirms tests pass
```

---

**Note:** You don't need TypeScript tools (eslint, prettier, tdd-guard-jest, etc.) for a Python-only project. The Quality Gates skill handles partial installs gracefully.
