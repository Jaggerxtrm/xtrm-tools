# TDD in AI-Assisted Coding — Empirical Research Brief (Enriched)
> Date: 2026-03-16 | Status: open research — not a final product decision
> Enriched: skillsmp.com search, deepwiki (fast-check, Hypothesis), ecosystem skill patterns

## Main Conclusion
**Do NOT implement TDD as universal default for xtrm.**
Empirical evidence supports a hybrid layered model. The case for TDD-first is weak for the key xtrm scenario: the same agent writing both code and tests.

**Nuance added after ecosystem search:** TDD is NOT without merit — it has a specific valid niche: when the interface is unclear/evolving and tests are needed to drive design decisions. Outside that niche, it is the wrong default.

## Why TDD-First Fails as Default

### 1. The "same agent" case is the weak case
Best pro-TDD evidence (arXiv 2402.13521) shows ~9–30% correctness improvement **only when tests are provided as external specification** (human-in-the-loop, user writes tests, model implements). When the agent generates both from the same context, the test only measures self-consistency — not correctness. This is compliance theater.

### 2. LLM-generated tests are often fragile (arXiv 2406.18181)
- GPT-4: 40% line coverage vs EvoSuite's 79%
- 34–62% syntactically invalid tests
- For 87% of defects: no valid test generated
- Of "attackable" defects: only 47% detected
False coverage is worse than no coverage.

### 3. Mature AI-assisted codebases don't use TDD-first
Pattern from GitHub Copilot, Anthropic, Cursor + confirmed by ecosystem (athola/precommit-setup, 213 stars):
`agent → first-pass → lint + type + build + test gates → human review`
Universal enforcement is on the **quality stack (PostToolUse)**, not red-green-refactor (PreToolUse).

### 4. Fragile tests crystallize early
ASE'16 study (152 projects): 88% of test smells born at first commit, ~80% uncorrected after 1,000 days, only 2.18% ever fixed.

## AI-Specific Anti-Patterns (NEW — from ecosystem)
Four failure modes agents commonly exhibit (MasterCodeYoda/test-strategy):
1. **Tautological tests** — Tests that restate the implementation as assertions. Verify by checking if the test would catch a real bug using concrete values, not computed ones.
2. **Assertion-free tests** — Tests executing code without meaningful verification. Every test must assert observable outcomes.
3. **Context leakage** — Tests passing due to shared mutable state. Each test must be independently runnable.
4. **Untested mutations** — Tests that exercise code paths but don't catch real bugs. Run mutation testing or "manual sabotage" on domain logic.

All four are amplified when the agent generates both code and tests from the same context.

## Strategy Selection Matrix (NEW — from ecosystem)
Different situations call for different strategies (MasterCodeYoda/test-strategy):

| Situation | Strategy | Rationale |
|-----------|----------|-----------|
| **Unclear/evolving interface** | TDD | Tests drive the design; each cycle reveals next interface decision |
| Known contract upfront | Spec-First | Write tests from specification, then implement |
| Data transformations/parsers | Property-Based | Generates edge cases humans miss; verifies invariants |
| Service boundaries/APIs | Contract Testing | Ensures producer-consumer interface alignment |
| Legacy code without tests | Characterization Testing | Captures existing behavior before changes |
| Simple CRUD | Example-Based | Avoid over-engineering |

**Key**: Most features combine multiple strategies — typical vertical slice uses TDD for domain logic, contract tests for APIs, property-based for transformations.

## Architectural Layers Model (NEW — from ecosystem)
Clean three-layer model (0x7067/test-gen):
- **Core layer** (pure functions, domain logic): unit tests + property-based tests — NO mocks, pass concrete values directly
- **Boundary layer** (parsers, I/O, external interfaces): contract tests — acceptance/rejection + round-trip
- **Shell layer** (orchestration, wiring): integration tests

## Executable Specifications — Answer to the Open Question (NEW)
The "open question" in original brief: does writing something that fails FIRST produce a better specification?

Answer from rmarquis/executable-specifications: **Yes, but the key is that it must be a specification, not a unit test.** Three-level structure:
1. **Interface contracts** — pre/post-conditions, return guarantees, error handling per module method
2. **Behavior specs** — Given-When-Then from acceptance criteria (one spec per requirement, traceable)
3. **Property specs** — invariants across random inputs (idempotence, round-trip, state invariants)

This is the "spec-first" variant of TDD that has empirical justification — it forces explicit specification before implementation, independent of test type.

## Recommended Hybrid Model (by layer)
| Layer | Coverage | Tools (TS/Python) | Enforcement |
|-------|----------|-------------------|-------------|
| Boundary contracts | Public APIs, service I/O | Zod / icontract + deal | PreToolUse reminder |
| Behavior/integration | User scenarios, public interfaces | Vitest / pytest | PostToolUse gate |
| Property-based | Invariants, round-trip, edge cases | fast-check+vitest / Hypothesis | Opt-in per domain |
| Selective unit | Algorithmic logic, pure functions | Vitest / pytest | Where local precision matters |
| Evals | Agent output, workflows | Anthropic evals pattern | Review step |
| Lint + types | Syntactic/static correctness | ESLint+tsc / Ruff+mypy | PostToolUse auto |

### Discovery-First Workflow (NEW — medtrics/14-test-unit-test)
Before writing any test: scope to changed files → classify candidates (real logic vs thin wrapper) → report findings → then write.
- **HIGH ROI**: pure functions, hooks with real logic (useState/useReducer/useMemo with branching), feature constants
- **LOW ROI / Skip**: thin wrappers (useQuery/useMutation that just call a service), service files (mocking proves nothing), components (E2E territory)

### Classical vs London-School (NEW — markky21/nextjs-classical-testing)
- **Don't mock**: your own code, internal collaborators, child components
- **Do mock**: external APIs, Next.js primitives, network requests (via MSW at HTTP boundary)
- For own data layer: use **in-memory fakes implementing the same interface**, not `vi.fn()` stubs
- Assert on observable DOM/return value changes, not on handler calls

### Property-Based Testing Patterns (NEW — deepwiki fast-check, Hypothesis)
Six foundational invariant patterns worth testing:
1. Idempotency: `f(f(x)) == f(x)`
2. Round-trip: `parse(serialize(x)) == x`
3. Commutativity: `f(a,b) == f(b,a)`
4. Monotonicity: ordered input preserves ordered output
5. Invariant preservation: pre-conditions guarantee post-conditions
6. Identity element: `f(x, identity) == x`

fast-check + Vitest: use `test.prop([fc.string(), ...])` or one-time `g` function for controlled randomness.
Hypothesis + pytest: use `--hypothesis-profile=ci`, `@given` combines with `@pytest.mark.parametrize`, watch for `HealthCheck.function_scoped_fixture` with fixtures.

## Concrete Implications for xtrm
- **tdd-guard**: Deprecate as hard PreToolUse gate → convert to optional reminder suggesting a behavior/contract/spec before implementing. TDD valid opt-in when interface is evolving.
- **Stop hook**: Keep for beads workflow only. No synthetic user-message reinjection documented.
- **`using-TDD` skill**: Rewrite as `behavior-first` or `spec-first`. Add strategy selection matrix. TDD stays as opt-in for "unclear interface" scenarios.
- **`using-quality-gates`**: Correct universal default. PostToolUse gates (213-star ecosystem pattern). Strengthen, don't replace.
- **New skill candidate**: `executable-specifications` — spec-first workflow with 3-level structure (contracts → behavior → properties) that addresses the open question empirically.

## Key References
- arXiv 2402.13521 — Test-Driven Development for Code Generation
- arXiv 2406.18181 — Empirical Study of Unit Test Generation with LLMs
- Google Testing Blog — Effective Testing (test APIs, not internals)
- ASE'16 (W&M CS) — Test Smells persistence study
- Anthropic Engineering — Demystifying Evals for AI Agents
- Claude Code Docs — Hooks reference (Stop hook behavior)
- fast-check — @fast-check/vitest integration (deepwiki)
- Hypothesis — pytest integration, CI profiles (deepwiki)
- athola/precommit-setup (213★) — three-layer quality gate, testing as PostToolUse checkpoint
- MasterCodeYoda/test-strategy — AI anti-patterns + strategy selection matrix
- 0x7067/test-gen — architectural layers (core/boundary/shell) + 6 invariant patterns
- rmarquis/executable-specifications — spec-first 3-level structure
- markky21/nextjs-classical-testing — classical vs London-school, mock boundaries
- medtrics/14-test-unit-test — discovery-first workflow, risk-based prioritization
