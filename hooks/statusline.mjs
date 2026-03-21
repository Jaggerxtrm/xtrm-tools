#!/usr/bin/env node
// statusline.mjs — Claude Code statusLine for xt claude sessions
// Line 1: XTRM  dim(model [xx%])  hostname  bold(dir)  dim(branch (status))  dim((venv))
// Line 2: ◐ italic(claim title)  OR  ○ bold(N) open  — no background
//
// Colors: bold/dim/italic only — no explicit fg/bg, adapts to dark & light themes.
// State: .xtrm/statusline-claim (written by beads-claim-sync.mjs)
// Cache: /tmp per cwd, 5s TTL

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { tmpdir, hostname } from 'node:os';
import { createHash } from 'node:crypto';

// Claude Code passes statusline context as JSON on stdin
let ctx = {};
try { ctx = JSON.parse(readFileSync(0, 'utf8')); } catch {}

const cwd = ctx?.workspace?.current_dir ?? process.cwd();
const cacheKey = createHash('md5').update(cwd).digest('hex').slice(0, 8);
const CACHE_FILE = join(tmpdir(), `xtrm-sl-${cacheKey}.json`);
const CACHE_TTL = 5000;

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 2000 }).trim();
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

// ANSI — bold/dim/italic only; no explicit fg/bg colors
const R  = '\x1b[0m';
const B  = '\x1b[1m';   // bold on
const B_ = '\x1b[22m';  // bold off (normal intensity)
const D  = '\x1b[2m';   // dim on
const I  = '\x1b[3m';   // italic on
const I_ = '\x1b[23m';  // italic off

let data = getCached();
if (!data) {
  // Model + token %
  const modelId = ctx?.model?.display_name ?? ctx?.model?.id ?? null;
  const pct = ctx?.context_window?.used_percentage;
  const modelStr = modelId ? `${modelId}${pct != null ? ` [${Math.round(pct)}%]` : ''}` : null;

  // Short hostname
  const host = hostname().split('.')[0];

  // Directory — repo-relative like the global script
  const repoRoot = run('git rev-parse --show-toplevel');
  let displayDir;
  if (repoRoot) {
    const rel = relative(repoRoot, cwd) || '.';
    displayDir = rel === '.' ? basename(repoRoot) : `${basename(repoRoot)}/${rel}`;
  } else {
    displayDir = cwd.replace(process.env.HOME ?? '', '~');
  }

  // Branch + git status indicators
  let branch = null;
  let gitStatus = '';
  if (repoRoot) {
    branch = run('git -c core.useBuiltinFSMonitor=false branch --show-current') || run('git rev-parse --short HEAD');
    const porcelain = run('git -c core.useBuiltinFSMonitor=false --no-optional-locks status --porcelain') ?? '';
    let modified = false, staged = false, deleted = false;
    for (const l of porcelain.split('\n').filter(Boolean)) {
      if (/^ M|^AM|^MM/.test(l)) modified = true;
      if (/^A |^M /.test(l)) staged = true;
      if (/^ D|^D /.test(l)) deleted = true;
    }
    let st = (modified ? '*' : '') + (staged ? '+' : '') + (deleted ? '-' : '');
    const ab = run('git -c core.useBuiltinFSMonitor=false --no-optional-locks rev-list --left-right --count @{upstream}...HEAD');
    if (ab) {
      const [behind, ahead] = ab.split(/\s+/).map(Number);
      if (ahead > 0 && behind > 0) st += '↕';
      else if (ahead > 0) st += '↑';
      else if (behind > 0) st += '↓';
    }
    if (st) gitStatus = `(${st})`;
  }

  // Python venv
  const venv = process.env.VIRTUAL_ENV ? `(${basename(process.env.VIRTUAL_ENV)})` : null;

  // Beads
  let claimId = null;
  let claimTitle = null;
  let openCount = 0;
  if (existsSync(join(cwd, '.beads'))) {
    const claimFile = join(cwd, '.xtrm', 'statusline-claim');
    claimId = existsSync(claimFile) ? (readFileSync(claimFile, 'utf8').trim() || null) : null;
    if (claimId) {
      try {
        const raw = run(`bd show ${claimId} --json`);
        claimTitle = raw ? (JSON.parse(raw)?.[0]?.title ?? null) : null;
      } catch {}
    }
    if (!claimTitle) {
      const m = run('bd list')?.match(/\((\d+)\s+open/);
      if (m) openCount = parseInt(m[1], 10);
    }
  }

  data = { modelStr, host, displayDir, branch, gitStatus, venv, claimId, claimTitle, openCount };
  setCache(data);
}

const { modelStr, host, displayDir, branch, gitStatus, venv, claimId, claimTitle, openCount } = data;

// Line 1 — matches global format, XTRM prepended
const parts = [`${B}XTRM${B_}`];
if (modelStr) parts.push(`${D}${modelStr}${R}`);
parts.push(host);
if (displayDir) parts.push(`${B}${displayDir}${B_}`);
if (branch) parts.push(`${D}${[branch, gitStatus].filter(Boolean).join(' ')}${R}`);
if (venv) parts.push(`${D}${venv}${R}`);
const line1 = parts.join(' ');

// Line 2 — no background; open count bold
let line2;
if (claimTitle) {
  const cols = process.stdout.columns || 80;
  const prefix = ` ◐ ${claimId} `;
  const prefixLen = prefix.replace(/\x1b\[[0-9;]*m/g, '').length;
  const maxLen = cols - prefixLen - 1;
  const t = claimTitle.length > maxLen ? claimTitle.slice(0, maxLen - 1) + '…' : claimTitle;
  line2 = `${prefix}${I}${t}${I_}`;
} else {
  line2 = ` ○ ${openCount > 0 ? `${B}${openCount}${B_} open` : 'no open issues'}`;
}

process.stdout.write(line1 + '\n' + line2 + '\n');
process.exit(0);
