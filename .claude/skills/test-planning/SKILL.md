---
name: test-planning
description: "Plans and creates test issues alongside implementation work using bd issue tracker. Activates at two points: (1) when creating an issue board from a spec/plan — classifies each issue by code layer and attaches the right testing strategy as a companion issue or AC gate, and (2) when closing an implementation issue — checks whether adequate test coverage was planned, improves existing test issues if needed. Use this skill PROACTIVELY whenever you see implementation issues being created without test coverage, when an epic is being broken into tasks, when closing/reviewing implementation work, or when the user asks about testing strategy for a set of issues. Also activate when you see bd create, bd children, bd close in a planning context."
---

# Test Planning

This skill ensures every implementation issue has appropriate test coverage planned — not as an afterthought, but wired into the issue board from the start. It does NOT write test code; it classifies what needs testing, picks the right strategy, and creates bd issues that another agent (or human) will implement.

## When This Fires

### Trigger 1: Planning phase (issue board creation)

When breaking a spec or plan into bd issues — typically during epic decomposition or `bd create --parent` sequences — scan each implementation issue and create companion test issues.

### Trigger 2: Closure gate (implementation complete)

When an implementation issue is being closed (`bd close`), check whether:
- A test issue already exists for it (created in Trigger 1)
- The test issue needs updating based on what was actually built (scope may have shifted)
- Test coverage gaps appeared during implementation (new edge cases, API quirks discovered)

If a test issue exists, review and improve it. If none exists, create one before or alongside closure.

## Layer Detection

Read the issue title, description, and any code paths mentioned to classify which architectural layer the work touches. This determines the testing strategy.

### Core layer — pure domain logic
Code that transforms data, computes values, manages state, with no I/O. Examples:
- Config parsing/merging
- Data formatting (output renderers, serializers)
- Computation (implied rates from prices, spread calculations)
- State machines (session tracking, log rotation)
- Validators, parsers, transformers

**Signals**: "implement", "compute", "format", "parse", "validate", functions that take data and return data, no HTTP/DB/filesystem in the description.

### Boundary layer — I/O interfaces and service contracts
Code that crosses a system boundary: HTTP clients, API routes, database queries, file I/O, message queues. Examples:
- API client methods (async_client, REST wrappers)
- API route handlers
- Database query functions
- File readers/writers
- External service integrations

**Signals**: "endpoint", "API", "client", "route", "fetch", "query", URLs, ports, service names, request/response shapes mentioned.

### Shell layer — orchestration and wiring
Code that glues core + boundary together into user-facing features. Examples:
- CLI commands that call a client, transform data, then output
- Pipeline orchestrators
- Command handlers
- Workflow coordinators

**Signals**: "command", "CLI", "subcommand", "mercury <verb>", user-facing behavior described, combines multiple components.

## Testing Strategy Selection

### By layer

| Layer | Primary strategy | What to assert | Mock policy |
|---|---|---|---|
| Core | Unit + property tests | Input/output correctness, edge cases, invariants | No mocking needed — pure functions |
| Boundary | Contract tests (live preferred) | Response schemas, field presence/types, status codes, param behavior | Live > contract > mock (see preference order below) |
| Shell | Integration tests | Exit codes, output format validity, end-to-end wiring, error messages | Test the real thing via subprocess or function call |

### By situation (override layer default when applicable)

| Situation | Strategy | When to pick it |
|---|---|---|
| Interface unclear/evolving | TDD | Spec is vague, requirements shifting — tests define the contract |
| Contract known up front | Spec-first | API routes documented, response shapes defined — write schema assertions |
| Parsers/transforms/invariants | Property-based | The function should hold for any valid input, not just examples |
| Service/API boundaries | Contract testing | Testing the seam between systems — assert schemas, not implementations |
| Legacy code being wrapped | Characterization tests | Capture current behavior before changing it |
| Simple CRUD paths | Example-based | Straightforward input→output, a few examples suffice |

### Live-first preference

When services are accessible, prefer this order:

1. **Live tests** — hit real services, assert real responses. No mocking. This catches actual bugs: wrong URLs, changed schemas, auth issues, network edge cases. Mark with `@pytest.mark.live`.
2. **Contract tests with recorded fixtures** — if live access is intermittent, record responses once and replay. Still validates schema, but won't catch drift.
3. **Mocked tests** — last resort, only when no service access exists or for pure unit logic that has no I/O.

The rationale: mocks encode your assumptions about the system. If your assumptions were correct, you wouldn't need tests. Live tests validate reality.

## Creating Test Issues

### Naming convention

Test issues are children of the same parent epic as the implementation issue. Name pattern:

```
Test: <what's being tested> — <strategy>
```

Examples:
- "Test: rates/candles/stir/curve commands — CLI integration + contract tests"
- "Test: config system — unit tests for load/save/override/env precedence"
- "Test: async_client URL routing — live contract tests against all services"

### Issue structure

When creating a test issue with `bd create`:

```
bd create "Test: <description>" \
  -t task -p <same or +1 from impl issue> \
  --parent <same parent epic> \
  -l testing,<layer>,<phase> \
  --deps "blocks:<next-phase-issue-id>" \
  -d "<structured description>"
```

The description should contain:

1. **What implementation it covers** — reference the impl issue ID(s)
2. **Layer classification** — which layer and why
3. **Strategy chosen** — which testing approach and why
4. **Test file structure** — where tests go in the project
5. **What to assert** — specific assertions, not vague "test that it works"
6. **AC** — when is this test issue done

### Batching

Don't create one test issue per implementation issue — that's overhead. Batch by layer and phase:

- Group all core-layer issues from the same phase into one test issue
- Group all boundary-layer issues into one contract test issue
- Group all shell-layer issues into one integration test issue

Example: if a phase ships 4 CLI commands + 1 client change + 1 config change:
- 1 test issue for core (config unit tests)
- 1 test issue for boundary (client contract tests)
- 1 test issue for shell (CLI integration tests for all 4 commands)

### Gating

Test issues should gate the next phase of work. Use bd dependencies or document in the issue description:

```
This issue gates: .17 (analyze runner), .18 (spread), .19 (charts)
Do not start Phase 3 until these tests pass.
```

## Closure Gate Behavior

When an implementation issue is closed, check:

1. **Does a test issue exist?** Run `bd children <parent>` and look for test issues that reference this impl issue.

2. **Is the test issue still accurate?** Implementation often diverges from plan. Compare what was built (read the commit, check the code) against what the test issue specifies. Common drift:
   - New subcommands added that aren't in the test plan
   - API response shape different from what was expected
   - Edge cases discovered during implementation
   - Dependencies changed (a service turned out to be local-only)

3. **Update if needed.** Use `bd update <test-issue-id>` or `bd comments add <test-issue-id>` to add new assertions, remove obsolete ones, or note discovered quirks.

4. **If no test issue exists**, create one. Classify the layer, pick the strategy, write the assertions. This is the safety net for work that was done without planning tests upfront.

## Examples

### Planning phase — epic decomposition

Given an epic with these children:
```
.10 Scaffold CLI project structure
.11 Implement logging system
.12 Implement config system
.13 Implement output formatting
.14 Implement async HTTP client
```

Create:
```
bd create "Test: P1 core — unit tests for config, log, session, output" \
  -t task -p 1 --parent <epic> -l testing,core,phase-1 \
  -d "Unit + property tests for pure domain logic...
  Covers: .11, .12, .13
  Strategy: unit tests (core layer, pure logic, no I/O)
  ..."

bd create "Test: P1 boundary — live contract tests for async client" \
  -t task -p 1 --parent <epic> -l testing,boundary,phase-1 \
  -d "Contract tests against live services...
  Covers: .14
  Strategy: contract tests, live-first (boundary layer, HTTP I/O)
  ..."
```

### Closure gate — implementation done, test issue exists

Agent closes `.15` (data commands: rates, candles, stir, curve). Finds existing test issue `.26`. Reads `.26` description, compares against what `.15` actually built:

- `.15` added `rates iorb` subcommand not in original test plan → update `.26` to include IORB assertion
- `.15` discovered STIR implied rates are client-side computation → add property test: `implied_rate == 100 - price` for any valid price
- Update `.26` with `bd update` or add a comment

### Closure gate — no test issue exists

Agent closes a feature issue that was done ad-hoc. No test issue found. Agent:
1. Reads the implementation to classify the layer
2. Picks strategy
3. Creates test issue as child of same parent
4. Documents what to assert based on the actual code
