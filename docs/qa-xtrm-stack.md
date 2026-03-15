# xtrm-tools Stack QA

Full verification of the xtrm-tools installation on a target repo.
Run this on any repo that has xtrm installed (or install it first).

**xtrm version at time of writing:** 2.1.12
**Scope:** hooks, CLI, workflow enforcement, unit tests

---

## 0. Prerequisites

```bash
# Confirm xtrm is available
xtrm --version

# Confirm you are on a feature branch (NOT main/master)
git branch --show-current

# Confirm .beads exists (required for beads gate tests)
ls .beads/
```

If no beads project: `bd init` then continue.

---

## 1. Unit Tests (xtrm repo)

These must be run from the xtrm-tools repo itself, not the target repo.

```bash
cd ~/path/to/xtrm-tools

# Full hook test suite (should be 30 tests)
npm test --prefix cli -- test/hooks.test.ts

# Lint
npm run lint
```

**Pass criteria:** all tests green, zero lint errors.

---

## 2. Hook: main-guard — file edits blocked on main

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x"}}' \
  | MAIN_GUARD_PROTECTED_BRANCHES=main node ~/.claude/hooks/main-guard.mjs
echo "exit: $?"   # expect: 2
```

**Pass criteria:** exit 2, message contains "never edit files directly on master".

---

## 3. Hook: main-guard — git commit blocked on main

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m test"}}' \
  | MAIN_GUARD_PROTECTED_BRANCHES=main node ~/.claude/hooks/main-guard.mjs
echo "exit: $?"   # expect: 2
```

**Pass criteria:** exit 2, message contains "feature branch".

---

## 4. Hook: main-guard — git reset --hard origin/main allowed on main

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git reset --hard origin/main"}}' \
  | MAIN_GUARD_PROTECTED_BRANCHES=main node ~/.claude/hooks/main-guard.mjs
echo "exit: $?"   # expect: 0
```

**Pass criteria:** exit 0.

---

## 5. Hook: main-guard — git push to protected branch blocked

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' \
  | MAIN_GUARD_PROTECTED_BRANCHES=main node ~/.claude/hooks/main-guard.mjs
echo "exit: $?"   # expect: 2
```

**Pass criteria:** exit 2, message contains "PR workflow".

---

## 6. Hook: main-guard — safe Bash allowed on main

```bash
for cmd in "git status" "git log --oneline" "git checkout -b feature/x" "gh pr list" "bd list"; do
  exit_code=$(echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$cmd\"}}" \
    | MAIN_GUARD_PROTECTED_BRANCHES=main node ~/.claude/hooks/main-guard.mjs; echo $?)
  echo "$cmd → exit $exit_code"
done
```

**Pass criteria:** all exit 0.

---

## 7. Hook: beads-edit-gate — blocks edits without active claim

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x"},"session_id":"test-qa","cwd":"'$(pwd)'"}' \
  | node ~/.claude/hooks/beads-edit-gate.mjs
echo "exit: $?"   # expect: 2
```

**Pass criteria:** exit 2, message contains "no active claim".

---

## 8. Hook: beads-commit-gate — blocks commit with in_progress issues

```bash
ISSUE=$(bd create --title="QA test issue" --type=task 2>/dev/null | grep -o '[a-z]*-[a-z0-9]*$')
bd update $ISSUE --status=in_progress 2>/dev/null

echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m test"},"cwd":"'$(pwd)'"}' \
  | node ~/.claude/hooks/beads-commit-gate.mjs
echo "exit: $?"   # expect: 2

bd close $ISSUE 2>/dev/null
```

**Pass criteria:** exit 2, message contains "Close open issues before committing".

---

## 9. Hook: beads-stop-gate — blocks stop with in_progress issues

```bash
ISSUE=$(bd create --title="QA stop gate test" --type=task 2>/dev/null | grep -o '[a-z]*-[a-z0-9]*$')
bd update $ISSUE --status=in_progress 2>/dev/null

echo '{"cwd":"'$(pwd)'"}' \
  | node ~/.claude/hooks/beads-stop-gate.mjs
echo "exit: $?"   # expect: 2

bd close $ISSUE 2>/dev/null
```

**Pass criteria:** exit 2, message contains "BEADS STOP GATE".

---

## 10. Hook: beads-memory-gate — blocks stop when closed issues exist

```bash
# Should block (closed issues exist, no marker)
echo '{"cwd":"'$(pwd)'"}' \
  | node ~/.claude/hooks/beads-memory-gate.mjs
echo "exit: $?"   # expect: 2

# Marker escape hatch
touch .beads/.memory-gate-done
echo '{"cwd":"'$(pwd)'"}' \
  | node ~/.claude/hooks/beads-memory-gate.mjs
echo "exit: $?"   # expect: 0 (marker consumed)

ls .beads/.memory-gate-done 2>/dev/null && echo "FAIL: marker not deleted" || echo "PASS: marker deleted"
```

**Pass criteria:** first call exits 2 with "MEMORY GATE"; second exits 0 and marker is gone.

---

## 11. Hook: main-guard-post-push — PR reminder uses reset --hard

```bash
echo '{
  "tool_name":"Bash",
  "tool_input":{"command":"git push -u origin feat/test"},
  "tool_response":{"exit_code":0},
  "cwd":"'$(pwd)'"
}' | node ~/.claude/hooks/main-guard-post-push.mjs | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('systemMessage',''))"
```

**Pass criteria:** output contains `gh pr create`, `gh pr merge --squash`, and `reset --hard` (NOT `pull --ff-only`).

---

## 12. CLI: xtrm install --dry-run

```bash
xtrm install --dry-run
```

**Pass criteria:** shows planned changes, no files modified, exits 0.

---

## 13. CLI: xtrm install basic --yes

```bash
xtrm install basic --yes
xtrm status
```

**Pass criteria:** installs skills, general hooks, MCP servers without error. Status shows installed components.

---

## 14. CLI: xtrm install all --yes — verify beads wiring

```bash
xtrm install all --yes
```

Check that `~/.claude/settings.json` contains entries for all beads hooks:

```bash
python3 -c "
import json, sys
with open('$(eval echo ~)/.claude/settings.json') as f:
    s = json.load(f)
hooks = s.get('hooks', {})
pre = [h.get('hooks',[]) for h in hooks.get('PreToolUse',[])]
scripts = [h.get('script','') for group in pre for h in (group if isinstance(group,list) else [group])]

# Flatten all PreToolUse hook scripts
all_pre = []
for entry in hooks.get('PreToolUse', []):
    if isinstance(entry, dict):
        all_pre.append(entry.get('script',''))

required = ['beads-edit-gate.mjs','beads-commit-gate.mjs','main-guard.mjs']
for r in required:
    status = 'OK' if any(r in s for s in all_pre) else 'MISSING'
    print(f'{r}: {status}')

# Verify main-guard has a Bash entry
bash_entries = [e for e in hooks.get('PreToolUse',[]) if isinstance(e,dict) and 'Bash' in e.get('matcher','')]
mg_bash = any('main-guard' in e.get('script','') for e in bash_entries)
print(f'main-guard.mjs Bash matcher: {\"OK\" if mg_bash else \"MISSING\"}')

stop_scripts = [e.get('script','') for e in hooks.get('Stop',[]) if isinstance(e,dict)]
for r in ['beads-stop-gate.mjs','beads-memory-gate.mjs']:
    print(f'{r}: {\"OK\" if any(r in s for s in stop_scripts) else \"MISSING\"}')
"
```

**Pass criteria:** all entries show `OK`.

---

## 15. Workflow enforcement: end-to-end

Walk the full intended workflow and verify each gate fires at the right moment:

```
1.  git checkout -b feat/qa-e2e             → allowed on main (main-guard exits 0)
2.  bd create + bd update in_progress       → claim active
3.  [file edit via Claude]                  → allowed (claim exists)
4.  git commit (before bd close)            → BLOCKED by beads-commit-gate (exit 2)
5.  bd close <id>
6.  git commit                              → allowed (exit 0)
7.  git push -u origin feat/qa-e2e         → allowed + post-push reminder shown
8.  gh pr create --fill
9.  gh pr merge --squash
10. git checkout main                       → allowed (from feature branch, no guard)
11. git reset --hard origin/main            → allowed (main-guard allowlist, exit 0)
12. [session end]
    → beads-stop-gate: passes (no in_progress issues)
    → beads-memory-gate: blocks with "MEMORY GATE" (closed issues exist)
13. [evaluate session for bd remember]
    touch .beads/.memory-gate-done
    [stop again]                            → session ends cleanly
```

**Pass criteria:** each blocked step exits 2 with a clear guidance message; each allowed step exits 0.

---

## Summary Checklist

| # | Component | Pass |
|---|-----------|------|
| 1 | Unit tests (30) + lint | ☐ |
| 2 | main-guard blocks Write on main | ☐ |
| 3 | main-guard blocks git commit on main | ☐ |
| 4 | main-guard allows git reset --hard origin/main | ☐ |
| 5 | main-guard blocks git push to main | ☐ |
| 6 | main-guard allows safe Bash on main | ☐ |
| 7 | beads-edit-gate blocks without claim | ☐ |
| 8 | beads-commit-gate blocks with open issues | ☐ |
| 9 | beads-stop-gate blocks with open issues | ☐ |
| 10 | beads-memory-gate blocks + marker escape | ☐ |
| 11 | post-push reminder uses reset --hard | ☐ |
| 12 | xtrm install --dry-run | ☐ |
| 13 | xtrm install basic --yes | ☐ |
| 14 | xtrm install all --yes + beads wiring check | ☐ |
| 15 | End-to-end workflow | ☐ |
