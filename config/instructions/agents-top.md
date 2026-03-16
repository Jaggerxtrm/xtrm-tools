# XTRM Agent Workflow (Short)

This file is an **agent operating manual** (not a project overview).

1. **Start with scope**
   - Clarify task intent if ambiguous.
   - Prefer semantic discovery (Serena + GitNexus) over broad grep-first exploration.

2. **Track work in `bd`**
   - Use `bd ready --json` / `bd update <id> --claim --json` before edits.
   - Create discovered follow-ups with `--deps discovered-from:<id>`.

3. **Branch per issue (strict)**
   - Create a **new branch for each issue** from latest `main`.
   - Do **not** continue new work on a previously used branch.
   - Branch format: `feature/<issue-id>-<short-description>` (or `fix/...`, `chore/...`).

4. **Edit safely**
   - Use Serena symbol tools for code changes when possible.
   - Run GitNexus impact checks before symbol changes and detect-changes before commit.

5. **PR merge + return to main**
   - Always merge via PR (squash merge preferred).
   - After merge: switch to `main` and sync (`git reset --hard origin/main`).
   - Delete merged branch locally and remotely (`git branch -d <branch>` and `git push origin --delete <branch>`).

6. **Before finishing**
   - Run relevant tests/linters.
   - Close/update bead state.
   - Ensure changes are committed and pushed.
