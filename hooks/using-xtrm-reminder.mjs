#!/usr/bin/env node
// using-xtrm-reminder.mjs — Claude Code SessionStart hook
// Reads skills/using-xtrm/SKILL.md and injects it as additionalSystemPrompt
// so the agent starts every session already oriented on the xtrm workflow.
// Exit 0 in all paths (fail open).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
if (!pluginRoot) process.exit(0);

const skillPath = join(pluginRoot, 'skills', 'using-xtrm', 'SKILL.md');
let content;
try {
  content = readFileSync(skillPath, 'utf8');
} catch {
  process.exit(0);
}

// Strip YAML frontmatter (--- ... ---\n)
content = content.replace(/^---[\s\S]*?---\n/, '').trim();

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalSystemPrompt: content,
    },
  }) + '\n',
);
process.exit(0);
