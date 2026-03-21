#!/usr/bin/env node
// statusline.mjs — Claude Code statusLine command for xt claude worktree sessions
// Two lines:
//   Line 1 (plain):   XTRM  ⎇ <branch>
//   Line 2 (colored): ◐ <claim title in italics>  OR  ○ N open
// State file: .xtrm/statusline-claim (written by beads-claim-sync.mjs)
// Results cached 5s in /tmp to avoid hammering bd on every render.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

// Read session context from stdin (model, costUSD — piped by Claude Code)
let stdin = {};
try { stdin = JSON.parse(readFileSync(0, 'utf8')); } catch {}
const sessionModel = stdin.model ?? null;
const sessionCost  = stdin.costUSD ?? null;

function shortModel(m) {
  return m.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

function fmtCost(c) {
  if (c == null || c === 0) return null;
  return c < 0.01 ? '<$0.01' : `$${c.toFixed(2)}`;
}

const cwd = process.cwd();
const cacheKey = createHash('md5').update(cwd).digest('hex').slice(0, 8);
const CACHE_FILE = join(tmpdir(), `xtrm-sl-${cacheKey}.json`);
const CACHE_TTL = 5000;

function run(cmd) {
  try {
    return execSync(cmd, {
      encoding: 'utf8', cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 2000,
    }).trim();
  } catch { return null; }
}

function getCached() {
  try {
    const c = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    if (Date.now() - c.ts < CACHE_TTL) return c.data;
  } catch {}
  return null;
}

function setCache(data) {
  try { writeFileSync(CACHE_FILE, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// ANSI
const R          = '\x1b[0m';
const BOLD       = '\x1b[1m';
const BOLD_OFF   = '\x1b[22m';
const ITALIC     = '\x1b[3m';
const ITALIC_OFF = '\x1b[23m';
const FG_WHITE   = '\x1b[38;5;15m';
const FG_ACCENT  = '\x1b[38;5;75m';
const FG_MUTED   = '\x1b[38;5;245m';
const BG_CLAIMED = '\x1b[48;5;17m';
const BG_IDLE    = '\x1b[48;5;238m';

// Data
let data = getCached();
if (!data) {
  const branch = run('git branch --show-current');
  let claimTitle = null;
  let openCount = 0;

  const hasBeads = existsSync(join(cwd, '.beads'));
  if (hasBeads) {
    const claimFile = join(cwd, '.xtrm', 'statusline-claim');
    let claimId = null;
    if (existsSync(claimFile)) {
      claimId = readFileSync(claimFile, 'utf8').trim() || null;
    }

    if (claimId) {
      try {
        const raw = run(`bd show ${claimId} --json`);
        if (raw) {
          const parsed = JSON.parse(raw);
          claimTitle = parsed?.[0]?.title ?? null;
        }
      } catch {}
    }

    if (!claimTitle) {
      const listOut = run('bd list');
      const m = listOut?.match(/\((\d+)\s+open/);
      if (m) openCount = parseInt(m[1], 10);
    }
  }

  data = { branch, claimTitle, openCount };
  setCache(data);
}

// Render
const { branch, claimTitle, openCount } = data;
const cols = process.stdout.columns || 80;

const brand     = `${FG_MUTED}XTRM${R}`;
const branchStr = branch       ? `${FG_MUTED}⎇ ${branch}${R}`                : '';
const modelStr  = sessionModel ? `${FG_MUTED}${shortModel(sessionModel)}${R}` : '';
const costStr   = fmtCost(sessionCost) ? `${FG_MUTED}${fmtCost(sessionCost)}${R}` : '';
const line1 = [brand, branchStr, modelStr, costStr].filter(Boolean).join('  ');

function padded(text, bg) {
  const visible = text.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, cols - visible.length);
  return `${bg}${FG_WHITE}${text}${' '.repeat(pad)}${R}`;
}

let line2;
if (claimTitle) {
  const maxLen = cols - 4;
  const title = claimTitle.length > maxLen ? claimTitle.slice(0, maxLen - 1) + '\u2026' : claimTitle;
  line2 = padded(` \u25d0 ${ITALIC}${title}${ITALIC_OFF}`, BG_CLAIMED);
} else {
  const idle = openCount > 0 ? `\u25cb ${openCount} open` : '\u25cb no open issues';
  line2 = padded(` ${idle}`, BG_IDLE);
}

process.stdout.write(line1 + '\n' + line2 + '\n');
process.exit(0);
