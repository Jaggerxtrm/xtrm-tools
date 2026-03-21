import { Command } from 'commander';
import kleur from 'kleur';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

interface XtrmEvent {
  seq: number;
  id: string;
  created_at: string;
  runtime: string;
  session_id: string;
  worktree: string | null;
  layer: string;
  kind: string;
  outcome: string;
  tool_name: string | null;
  issue_id: string | null;
}

interface DebugOptions {
  all: boolean;
  follow: boolean;
  session: string | undefined;
  type: string | undefined;
  json: boolean;
}

// ── Kind labels ───────────────────────────────────────────────────────────────

type ColorFn = (s: string) => string;
interface LabelDef { label: string; color: ColorFn }

const KIND_LABELS: Record<string, LabelDef> = {
  'hook.edit_gate.allow':         { label: 'EDIT+', color: kleur.green },
  'hook.edit_gate.block':         { label: 'EDIT-', color: kleur.red   },
  'hook.commit_gate.allow':       { label: 'CMIT+', color: kleur.green },
  'hook.commit_gate.block':       { label: 'CMIT-', color: kleur.red   },
  'hook.stop_gate.allow':         { label: 'STOP+', color: kleur.green },
  'hook.stop_gate.block':         { label: 'STOP-', color: kleur.red   },
  'hook.memory_gate.acked':       { label: 'MEMO+', color: kleur.green },
  'hook.memory_gate.triggered':   { label: 'MEMO-', color: kleur.yellow },
  'hook.worktree_boundary.block': { label: 'WTRE-', color: kleur.red   },
  'bd.claimed':                   { label: 'CLMD ', color: kleur.cyan  },
  'bd.closed':                    { label: 'CLSD ', color: kleur.green },
  'bd.auto_committed':            { label: 'ACMT+', color: kleur.cyan  },
};

function getLabel(kind: string, outcome: string): string {
  const def = KIND_LABELS[kind];
  if (!def) {
    const short = (kind.split('.').pop() ?? 'UNKN').slice(0, 4).toUpperCase();
    const label = `${short}${outcome === 'block' ? '-' : '+'}`.padEnd(5);
    return outcome === 'block' ? kleur.red(label) : kleur.green(label);
  }
  if (kind === 'bd.auto_committed') {
    return outcome === 'block' ? kleur.red('ACMT-') : kleur.cyan('ACMT+');
  }
  return def.color(def.label);
}

// ── Session color map ─────────────────────────────────────────────────────────

const SESSION_COLORS: ColorFn[] = [
  kleur.blue, kleur.green, kleur.yellow, kleur.cyan, kleur.magenta,
];

function buildSessionColorMap(events: XtrmEvent[]): Map<string, ColorFn> {
  const map = new Map<string, ColorFn>();
  for (const ev of events) {
    if (!map.has(ev.session_id)) {
      map.set(ev.session_id, SESSION_COLORS[map.size % SESSION_COLORS.length]);
    }
  }
  return map;
}

function extendSessionColorMap(map: Map<string, ColorFn>, events: XtrmEvent[]): void {
  for (const ev of events) {
    if (!map.has(ev.session_id)) {
      map.set(ev.session_id, SESSION_COLORS[map.size % SESSION_COLORS.length]);
    }
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtTime(created_at: string): string {
  try {
    const d = new Date(created_at);
    if (isNaN(d.getTime())) return created_at.slice(11, 19) || '??:??:??';
    return d.toLocaleTimeString('en-GB', { hour12: false });
  } catch {
    return created_at.slice(11, 19) || '??:??:??';
  }
}

function buildDetail(event: XtrmEvent): string {
  const parts: string[] = [];
  if (event.tool_name) parts.push(kleur.dim(`tool=${event.tool_name}`));
  if (event.issue_id)  parts.push(kleur.yellow(`issue=${event.issue_id}`));
  if (event.worktree)  parts.push(kleur.dim(`wt=${event.worktree}`));
  return parts.join('  ') || kleur.dim('—');
}

function formatEventLine(event: XtrmEvent, colorMap: Map<string, ColorFn>): string {
  const time    = kleur.dim(fmtTime(event.created_at));
  const colorFn = colorMap.get(event.session_id) ?? kleur.white;
  const session = colorFn(event.session_id.slice(0, 8));
  const label   = getLabel(event.kind, event.outcome);
  const detail  = buildDetail(event);
  return `${time}  ${session}  ${label}  ${detail}`;
}

function printHeader(): void {
  const h = kleur.dim;
  console.log(`  ${h('TIME      ')}  ${h('SESSION ')}  ${h('LABEL')}  ${h('DETAIL')}`);
  console.log(`  ${kleur.dim('─'.repeat(72))}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findProjectRoot(cwd: string): string | null {
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, '.beads'))) return dir;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Parse the pipe-separated table output from `bd sql`.
 * Skips the header row and separator line, maps columns by position.
 */
function parseBdTable(output: string, columns: string[]): Record<string, string>[] {
  const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
  const sepIdx = lines.findIndex(l => /^[-+\s]+$/.test(l) && l.includes('-'));
  if (sepIdx < 1) return [];

  return lines
    .slice(sepIdx + 1)
    .filter(l => !l.startsWith('('))
    .map(line => {
      const cells = line.split('|').map(c => c.trim());
      const row: Record<string, string> = {};
      columns.forEach((col, i) => { row[col] = cells[i] ?? ''; });
      return row;
    });
}

const COLS     = 'seq, id, created_at, runtime, session_id, worktree, layer, kind, outcome, tool_name, issue_id';
const COL_NAMES = ['seq', 'id', 'created_at', 'runtime', 'session_id', 'worktree', 'layer', 'kind', 'outcome', 'tool_name', 'issue_id'];

// Migration SQL — adds seq column to tables created before this version
const ADD_SEQ_SQL = `ALTER TABLE xtrm_events ADD COLUMN seq INT NOT NULL AUTO_INCREMENT, ADD UNIQUE KEY uk_seq (seq)`;

function queryEvents(cwd: string, where: string, limit: number): XtrmEvent[] {
  const sql = `SELECT ${COLS} FROM xtrm_events${where ? ` WHERE ${where}` : ''} ORDER BY seq ASC LIMIT ${limit}`;

  let result = spawnSync('bd', ['sql', sql], {
    cwd, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8', timeout: 8000,
  });

  if (result.status !== 0) {
    // Attempt seq column migration (silently ignored if already present)
    spawnSync('bd', ['sql', ADD_SEQ_SQL], {
      cwd, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8', timeout: 5000,
    });
    result = spawnSync('bd', ['sql', sql], {
      cwd, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8', timeout: 8000,
    });
  }

  if (result.status !== 0) return [];

  return parseBdTable(result.stdout, COL_NAMES).map(r => ({
    seq:        parseInt(r.seq, 10) || 0,
    id:         r.id,
    created_at: r.created_at,
    runtime:    r.runtime,
    session_id: r.session_id,
    worktree:   r.worktree === '<nil>' || !r.worktree ? null : r.worktree,
    layer:      r.layer,
    kind:       r.kind,
    outcome:    r.outcome,
    tool_name:  r.tool_name === '<nil>' || !r.tool_name ? null : r.tool_name,
    issue_id:   r.issue_id === '<nil>' || !r.issue_id ? null : r.issue_id,
  }));
}

// ── Where clause builder ──────────────────────────────────────────────────────

function buildWhere(opts: DebugOptions, baseClause: string): string {
  const clauses: string[] = [];
  if (baseClause) clauses.push(baseClause);
  if (opts.session) {
    const s = opts.session.replace(/'/g, "''");
    clauses.push(`session_id LIKE '${s}%'`);
  }
  if (opts.type) {
    const layer = opts.type.replace(/'/g, "''");
    clauses.push(`layer = '${layer}'`);
  }
  return clauses.join(' AND ');
}

// ── Follow mode ───────────────────────────────────────────────────────────────

function follow(cwd: string, opts: DebugOptions): void {
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  const initial = queryEvents(cwd, buildWhere(opts, `created_at >= '${fiveMinsAgo}'`), 200);
  const colorMap = buildSessionColorMap(initial);
  let lastSeq = 0;

  if (initial.length > 0) {
    for (const ev of initial) {
      if (ev.seq > lastSeq) lastSeq = ev.seq;
      if (opts.json) { console.log(JSON.stringify(ev)); }
      else           { console.log('  ' + formatEventLine(ev, colorMap)); }
    }
  } else if (!opts.json) {
    console.log(kleur.dim('  (no recent events — waiting for new ones)\n'));
  }

  // Poll every 2s using seq > lastSeq (clean incremental — no datetime overlap needed)
  const interval = setInterval(() => {
    const events = queryEvents(cwd, buildWhere(opts, `seq > ${lastSeq}`), 50);
    if (events.length > 0) {
      extendSessionColorMap(colorMap, events);
      for (const ev of events) {
        if (ev.seq > lastSeq) lastSeq = ev.seq;
        if (opts.json) { console.log(JSON.stringify(ev)); }
        else           { console.log('  ' + formatEventLine(ev, colorMap)); }
      }
    }
  }, 2000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    if (!opts.json) console.log(kleur.dim('\n  stopped\n'));
    process.exit(0);
  });
}

// ── Command ───────────────────────────────────────────────────────────────────

export function createDebugCommand(): Command {
  return new Command('debug')
    .description('Watch xtrm hook and bd lifecycle events in real time')
    .option('-f, --follow',         'Follow new events (default when no other mode set)', false)
    .option('--all',                'Show full history and exit', false)
    .option('--session <id>',       'Filter by session ID (prefix match)')
    .option('--type <layer>',       'Filter by layer: gate | bd')
    .option('--json',               'Output raw JSON lines', false)
    .action((opts: DebugOptions) => {
      const cwd  = process.cwd();
      const root = findProjectRoot(cwd);

      if (!root) {
        console.error(kleur.red('\n  ✗ No beads project found (.beads directory missing)\n'));
        console.error(kleur.dim('  Run from inside an xtrm project.\n'));
        process.exit(1);
      }

      if (!opts.json) {
        console.log(kleur.bold('\n  xtrm event log'));
        if (opts.all) {
          console.log(kleur.dim('  Showing full history\n'));
        } else {
          console.log(kleur.dim('  Following events — Ctrl+C to stop\n'));
        }
        printHeader();
      }

      if (opts.all) {
        const events = queryEvents(root, buildWhere(opts, ''), 200);
        if (events.length === 0) {
          if (!opts.json) {
            console.log(kleur.dim('\n  No events recorded yet.'));
            console.log(kleur.dim('  Events appear here as hooks fire and bd lifecycle runs.\n'));
          }
        } else {
          const colorMap = buildSessionColorMap(events);
          for (const ev of events) {
            if (opts.json) { console.log(JSON.stringify(ev)); }
            else           { console.log('  ' + formatEventLine(ev, colorMap)); }
          }
          if (!opts.json) console.log('');
        }
        return;
      }

      // Follow mode (default)
      follow(root, opts);
    });
}
