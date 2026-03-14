#!/usr/bin/env node
// beads-stop-gate — Claude Code Stop hook
// Blocks the agent from stopping when this session has an unclosed claim in bd kv.
// Falls back to global in_progress check when session_id is unavailable.
// Exit 0: allow stop  |  Exit 2: block stop (stderr shown to Claude)
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

const CLOSE_PROTOCOL =
  '  3. bd close <id1> <id2> ...               close all in_progress issues\n' +
  '  4. git add <files> && git commit -m "..."  commit your changes\n' +
  '  5. git push -u origin <feature-branch>     push feature branch\n' +
  '  6. gh pr create --fill                     create PR\n' +
  '  7. gh pr merge --squash                    merge PR\n' +
  '  8. git checkout master && git reset --hard origin/master\n';

withSafeBdContext(() => {
  const cwd = resolveCwd(input);
  if (!isBeadsProject(cwd)) process.exit(0);

  const sessionId = input.session_id;

  if (sessionId) {
    const claimed = getSessionClaim(sessionId, cwd);
    if (claimed === null) process.exit(0); // bd kv unavailable — fail open
    if (!claimed) process.exit(0);         // no active claim for this session

    const ip = getInProgress(cwd);
    if (ip === null || ip.count === 0) process.exit(0); // claim is stale — allow stop
    const summary = ip?.summary ?? `  Claimed: ${claimed}`;

    process.stderr.write(
      '🚫 BEADS STOP GATE: Unresolved issues — complete the session close protocol.\n\n' +
      `Open issues:\n${summary}\n\n` +
      'Session close protocol:\n' + CLOSE_PROTOCOL
    );
    process.exit(2);
  } else {
    const ip = getInProgress(cwd);
    if (ip === null || ip.count === 0) process.exit(0);

    process.stderr.write(
      '🚫 BEADS STOP GATE: Unresolved issues — complete the session close protocol.\n\n' +
      `Open issues:\n${ip.summary}\n\n` +
      'Session close protocol:\n' + CLOSE_PROTOCOL
    );
    process.exit(2);
  }
});
