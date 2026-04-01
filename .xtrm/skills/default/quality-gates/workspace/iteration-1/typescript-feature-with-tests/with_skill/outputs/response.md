# Eval 1: typescript-feature-with-tests

**Prompt:** Add a new authentication middleware to src/auth.ts that validates JWT tokens. The middleware should check the Authorization header, verify the token, and attach the user to the request object.

**Skill Applied:** using-quality-gates

---

## Response (with skill active)

To add the authentication middleware, we need to follow the **TDD workflow** enforced by Quality Gates:

### Step 1: Write a Failing Test First

Before implementing the middleware, you need to write a test that will fail without the implementation. The TDD Guard will block implementation until a failing test exists.

**Create** `src/auth.test.ts` or add to existing test file:

```typescript
import { authMiddleware } from './auth';

describe('authMiddleware', () => {
  it('should reject requests without Authorization header', async () => {
    const req = { headers: {} } as Request;
    const next = vi.fn();
    
    await authMiddleware(req, {} as Response, next);
    
    expect(next).not.toHaveBeenCalled();
  });

  it('should attach user to request with valid JWT', async () => {
    const token = generateValidToken(); // your test helper
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const next = vi.fn();
    
    await authMiddleware(req, {} as Response, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
  });
});
```

Run tests to confirm they fail:
```bash
npm test  # or: npx vitest run
```

### Step 2: Implement the Middleware

Once tests are failing, TDD Guard will allow implementation:

```typescript
// src/auth.ts
import jwt from 'jsonwebtoken';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

### Step 3: Quality Gate Validation

After editing `src/auth.ts`, the **TypeScript Quality Gate** will automatically run:
- **TypeScript compilation** - Checks types
- **ESLint** - Validates code style (auto-fixes if enabled)
- **Prettier** - Formats code (auto-fixes if enabled)

If any issues are found, you'll see error output. Fix remaining issues manually (type errors can't be auto-fixed).

### Step 4: Verify Tests Pass

```bash
npm test  # All tests should now pass
```

---

**Note:** Ensure you have the required dependencies installed:
- `npm install --save-dev tdd-guard-vitest` (for Vitest test reporter)
- `npm install --save-dev typescript eslint prettier` (for quality gate)
