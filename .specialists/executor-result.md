## Summary
Implemented the merge-delta cwd fix by resolving the **main worktree root** and running preview/merge/gates against that directory instead of `process.cwd()`.

I applied the fix in:

- `/home/dawid/projects/specialists/src/cli/merge.ts`

(That is where `previewBranchMergeDelta`, `mergeBranch`, and `runMergePlan` exist.)

## Status
✅ success

## Changes
- Added `resolveMainWorktreeRoot(cwd)`:
  - Uses `git worktree list --porcelain`
  - Reads the first `worktree ...` entry (main worktree)
  - Falls back to `git rev-parse --show-toplevel`
- Updated merge-path functions to accept/preserve explicit `cwd`:
  - `previewBranchMergeDelta(branch, cwd?)`
  - `assertBranchMergeWorthiness(target, cwd?)`
  - `getConflictFiles(cwd?)`
  - `mergeBranch(branch, cwd?)`
  - `runTypecheckGate(cwd?)`
  - `runRebuild(cwd?)`
  - `readChangedFilesForLastMerge(cwd?)`
- Updated `runMergePlan(...)`:
  - Resolves `mainRepoRoot` once
  - Passes `mainRepoRoot` to preview + merge + typecheck + changed-file detection + rebuild

This ensures `sp merge` preview merge is performed from main worktree context, preventing self-merge empty delta when invoked from a worktree.

## Verification
- `bunx tsc --noEmit` (in `/home/dawid/projects/specialists`) passed.
- GitNexus impact analysis run (repo: `specialists`) for:
  - `previewBranchMergeDelta` → LOW
  - `mergeBranch` → LOW
  - `runMergePlan` → LOW
- GitNexus detect changes run (repo: `specialists`).

## Risks
- `resolveMainWorktreeRoot` assumes first `git worktree list --porcelain` entry is the main worktree (matches your stated invariant).
- Existing uncommitted edits in `specialists` repo outside this task may still appear in detect-changes output (pre-existing noise).

## Follow-ups
- Add a focused regression test for:
  - invoking merge from a linked worktree while target branch is ahead of main
  - asserting non-empty preview delta when substantive changes exist.
- If you want, I can port the same guard pattern to any similar merge-preview logic elsewhere.

## Beads
- Claimed and worked issue: `xtrm-3kpo` (in this session context).

## Machine-readable block
```json
{
  "summary": "Fixed sp merge empty-delta false positives by resolving main worktree root and executing preview/merge/typecheck/rebuild operations in that cwd, avoiding branch-into-self merges from worktree invocation contexts.",
  "status": "success",
  "issues_closed": [],
  "issues_created": [],
  "follow_ups": [
    "Add regression tests for preview merge when invoked from a worktree",
    "Optionally apply the same main-worktree cwd enforcement to any other merge-preview commands"
  ],
  "risks": [
    "Relies on git worktree list first-entry invariant for main worktree selection",
    "GitNexus detect_changes output includes unrelated pre-existing modifications in specialists repo"
  ],
  "verification": [
    "Ran bunx tsc --noEmit in /home/dawid/projects/specialists (passed)",
    "Ran gitnexus_impact for previewBranchMergeDelta/mergeBranch/runMergePlan in repo specialists (all LOW)",
    "Ran gitnexus_detect_changes in repo specialists"
  ],
  "files_changed": [
    "/home/dawid/projects/specialists/src/cli/merge.ts"
  ],
  "symbols_modified": [
    "resolveMainWorktreeRoot",
    "previewBranchMergeDelta",
    "assertBranchMergeWorthiness",
    "getConflictFiles",
    "mergeBranch",
    "runTypecheckGate",
    "runRebuild",
    "readChangedFilesForLastMerge",
    "runMergePlan"
  ],
  "lint_pass": true,
  "tests_pass": false,
  "impact_report": {
    "files_touched": [
      "/home/dawid/projects/specialists/src/cli/merge.ts"
    ],
    "symbols_analyzed": [
      "previewBranchMergeDelta",
      "mergeBranch",
      "runMergePlan"
    ],
    "highest_risk": "LOW",
    "tool_invocations": 6
  }
}
```