#!/usr/bin/env node
// beads-edit-gate — Claude Code PreToolUse hook
// Blocks file edits when this session has not claimed a beads issue via bd kv.
// Falls back to global in_progress check when session_id is unavailable.
// Only active in projects with a .beads/ directory.
// Exit 0: allow  |  Exit 2: block (stderr shown to Claude)
//
// Installed by: xtrm install

import { readFileSync } from 'node:fs';
import {
  resolveCwd, isBeadsProject, getSessionClaim,
  getTotalWork, getInProgress, withSafeBdContext,
} from './beads-gate-utils.mjs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

withSafeBdContext(() => {
  const cwd = resolveCwd(input);
  if (!isBeadsProject(cwd)) process.exit(0);

  const sessionId = input.session_id;

  if (sessionId) {
    const claimed = getSessionClaim(sessionId, cwd);
    if (claimed === null) process.exit(0); // bd kv unavailable — fail open
    if (claimed) process.exit(0);          // this session has an active claim

    const totalWork = getTotalWork(cwd);
    if (totalWork === null) process.exit(0); // can't determine — fail open
    if (totalWork === 0) process.exit(0);    // nothing to track — clean-start state

    process.stderr.write(
      '🚫 BEADS GATE: This session has no active claim — claim an issue before editing files.\n\n' +
      '  bd update <id> --status=in_progress\n' +
      `  bd kv set "claimed:${sessionId}" "<id>"\n\n` +
      'Or create a new issue:\n' +
      '  bd create --title="<what you\'re doing>" --type=task --priority=2\n' +
      '  bd update <id> --status=in_progress\n' +
      `  bd kv set "claimed:${sessionId}" "<id>"\n`
    );
    process.exit(2);
  } else {
    // Fallback: global in_progress check (non-Claude environments / no session_id).
    const ip = getInProgress(cwd);
    if (ip === null) process.exit(0);
    if (ip.count > 0) process.exit(0);

    const totalWork = getTotalWork(cwd);
    if (totalWork === null || totalWork === 0) process.exit(0);

    process.stderr.write(
      '🚫 BEADS GATE: No active issue — create one before editing files.\n\n' +
      '  bd create --title="<what you\'re doing>" --type=task --priority=2\n' +
      '  bd update <id> --status=in_progress\n\n' +
      'Full workflow (do this every session):\n' +
      '  1. bd create + bd update in_progress   ← you are here\n' +
      '  2. Edit files / write code\n' +
      '  3. bd close <id>                        close when done\n' +
      '  4. git add <files> && git commit\n' +
      '  5. git push -u origin <feature-branch>\n' +
      '  6. gh pr create --fill && gh pr merge --squash\n' +
      '  7. git checkout master && git reset --hard origin/master\n'
    );
    process.exit(2);
  }
});
