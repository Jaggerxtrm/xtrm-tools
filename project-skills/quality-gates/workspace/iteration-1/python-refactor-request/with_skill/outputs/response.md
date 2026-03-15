# Eval 2: python-refactor-request

**Prompt:** Refactor the database connection pooling in db/connection.py to use async/await. Current implementation is blocking and causing performance issues.

**Skill Applied:** using-quality-gates

---

## Response (with skill active)

To refactor the database connection pooling to async/await, follow the **Quality Gates workflow** for Python:

### Step 1: Write a Failing Test First

TDD Guard requires a failing test before implementation. Create a test that verifies async behavior:

**Create** `tests/test_connection_async.py`:

```python
import pytest
import asyncio
from db.connection import AsyncConnectionPool

class TestAsyncConnectionPool:
    @pytest.mark.asyncio
    async def test_async_connection_acquire(self):
        pool = AsyncConnectionPool(max_size=5)
        async with pool.acquire() as conn:
            assert conn is not None
            result = await conn.execute("SELECT 1")
            assert result == 1
    
    @pytest.mark.asyncio
    async def test_async_connection_pooling(self):
        pool = AsyncConnectionPool(max_size=2)
        tasks = [pool.acquire() for _ in range(5)]
        # Should handle contention gracefully
        async with asyncio.TaskGroup() as tg:
            for task in tasks:
                tg.create_task(task)
```

Run tests to confirm failure:
```bash
pytest tests/test_connection_async.py  # Should fail - implementation doesn't exist
```

### Step 2: Implement Async Refactor

Once tests fail, TDD Guard allows implementation:

```python
# db/connection.py
import asyncio
import asyncpg
from contextlib import asynccontextmanager

class AsyncConnectionPool:
    def __init__(self, max_size: int = 10, dsn: str = None):
        self.max_size = max_size
        self.dsn = dsn or os.environ.get("DATABASE_URL")
        self._pool = None
    
    async def initialize(self):
        self._pool = await asyncpg.create_pool(
            self.dsn,
            max_size=self.max_size,
            command_timeout=60
        )
    
    @asynccontextmanager
    async def acquire(self):
        if not self._pool:
            await self.initialize()
        async with self._pool.acquire() as conn:
            yield conn
    
    async def close(self):
        if self._pool:
            await self._pool.close()
```

### Step 3: Python Quality Gate Validation

After editing `db/connection.py`, the **Python Quality Gate** automatically runs:

- **Ruff linting** - Checks style, best practices (auto-fixes enabled)
- **Ruff formatting** - Black-compatible formatting (auto-fixes enabled)
- **Mypy type checking** - Static type validation (manual fix required)

If blocking errors (exit code 2), fix remaining issues. Type errors and complex lint violations need manual fixes.

### Step 4: Verify Tests Pass

```bash
pytest tests/test_connection_async.py -v  # All tests should pass
```

---

**Note:** Ensure dependencies are installed:
- `pip install tdd-guard-pytest` (TDD Guard reporter)
- `pip install ruff mypy` (Quality gate tools)
- `pip install asyncpg pytest pytest-asyncio` (Async DB and testing)
