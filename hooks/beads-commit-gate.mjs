#!/usr/bin/env node
// beads-commit-gate — Claude Code PreToolUse hook
// Blocks `git commit` when this session still has an unclosed claim in bd kv.
// Falls back to global in_progress check when session_id is unavailable.
// Forces: close issues first, THEN commit.
// Exit 0: allow  |  Exit 2: block (stderr shown to Claude)
//
// Installed by: xtrm install

import { readFileSync } from 'node:fs';
import {
  resolveCwd, isBeadsProject, getSessionClaim,
  getInProgress, withSafeBdContext,
} from './beads-gate-utils.mjs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if ((input.tool_name ?? '') !== 'Bash') process.exit(0);
if (!/\bgit\s+commit\b/.test(input.tool_input?.command ?? '')) process.exit(0);

const NEXT_STEPS =
  '  3. bd close <id1> <id2> ...             ← you are here\n' +
  '  4. git add <files> && git commit -m "..."\n' +
  '  5. git push -u origin <feature-branch>\n' +
  '  6. gh pr create --fill && gh pr merge --squash\n' +
  '  7. git checkout master && git reset --hard origin/master\n';

withSafeBdContext(() => {
  const cwd = resolveCwd(input);
  if (!isBeadsProject(cwd)) process.exit(0);

  const sessionId = input.session_id;

  if (sessionId) {
    const claimed = getSessionClaim(sessionId, cwd);
    if (claimed === null) process.exit(0);
    if (!claimed) process.exit(0);

    const ip = getInProgress(cwd);
    const summary = ip?.summary ?? `  Claimed: ${claimed}`;

    process.stderr.write(
      '🚫 BEADS GATE: Close open issues before committing.\n\n' +
      `Open issues:\n${summary}\n\n` +
      'Next steps:\n' + NEXT_STEPS
    );
    process.exit(2);
  } else {
    const ip = getInProgress(cwd);
    if (ip === null || ip.count === 0) process.exit(0);

    process.stderr.write(
      '🚫 BEADS GATE: Close open issues before committing.\n\n' +
      `Open issues:\n${ip.summary}\n\n` +
      'Next steps:\n' + NEXT_STEPS
    );
    process.exit(2);
  }
});
