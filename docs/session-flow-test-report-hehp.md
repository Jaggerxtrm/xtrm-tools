# Session-Flow Test Report: Pi Runtime Parity

## 1) Metadata

- Issue ID: jaggers-agent-tools-hehp
- Runtime: Pi
- Tester: AI Agent (Claude via Pi)
- Date: 2026-03-18
- Branch/Commit tested: main @ e281670 (v2.4.2)
- Environment: Fedora Linux, Node v25.2.1, bd (beads) issue tracker

---

## 2) Scenarios Executed

### A. Claim Flow

**Command/Event:** `bd update jaggers-agent-tools-hehp --claim`

**Observed:**
- ✅ Claim detected by `session-flow.ts` via `tool_result` event handler
- ✅ Worktree created at `.worktrees/jaggers-agent-tools-hehp`
- ✅ Session state written with `phase: claimed`
- ✅ Guidance message appended

**Pass/Fail:** ✅ PASS

---

### B. Main Guard Behavior

**Observed:**
- ❌ Main-guard blocked `create_text_file` with wrong message
- ❌ Message said "start on a feature branch" instead of referencing the worktree
- ❌ Bash with `cat` blocked as "restricted" (read-only commands should be allowed)

**Pass/Fail:** ❌ FAIL

**Bug filed:** jaggers-agent-tools-jhks (P0), jaggers-agent-tools-5f40 (P2)

---

### C. Memory Stop Hook

**Observed:**
- ❌ Memory stop hook did NOT fire
- ❌ Root cause: `beads-claim-sync.mjs` clears the kv claim on `bd close`
- ❌ Memory gate checks for claim, finds nothing, exits early

**Pass/Fail:** ❌ FAIL (CRITICAL REGRESSION)

**Bug filed:** jaggers-agent-tools-drxm (P0)

---

### D. Extension Interaction Order

**Policy order:**
```
main-guard.json:    order=10, runtime=both
session-flow.json:  order=19, runtime=both
beads.json:         order=20, runtime=both
```

**Pass/Fail:** ✅ PASS

---

## 3) Defects Found

### Bug 1: Main-guard blocks read-only Bash commands
- **ID:** jaggers-agent-tools-jhks
- **Severity:** P1
- **Repro:** Run `cat file.txt` on main branch

### Bug 2: Wrong message - doesn't reference worktree
- **ID:** jaggers-agent-tools-5f40
- **Severity:** P2
- **Repro:** Claim an issue, then try to edit on main

### Bug 3: Memory stop hook broken (CRITICAL)
- **ID:** jaggers-agent-tools-drxm
- **Severity:** P0
- **Repro:** 
  1. Claim an issue: `bd update <id> --claim`
  2. Close it: `bd close <id>`
  3. Stop the session
  4. Memory gate never fires

---

## 4) Final Verdict

**Overall Result:** ❌ FAIL

**Critical Issues:**
1. Memory gate is completely broken (P0)
2. Main-guard incorrectly blocks read-only commands (P1)
3. Wrong messaging confuses users (P2)

**Residual Risks:**
- Memory capture workflow is non-functional
- User experience is degraded

**Recommended Next Action:** 
Fix P0 issue jaggers-agent-tools-drxm before any other work.
