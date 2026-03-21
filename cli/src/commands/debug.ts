import { Command } from 'commander';
import kleur from 'kleur';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

interface XtrmEvent {
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
  session: string | undefined;
  type: string | undefined;
  json: boolean;
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
 * Format:
 *   col1 | col2 | col3
 *   -----+------+-----
 *   val1 | val2 | val3
 *   (N rows)
 */
function parseBdTable(output: string, columns: string[]): Record<string, string>[] {
  const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
  // Find the separator line (only dashes, pluses, spaces)
  const sepIdx = lines.findIndex(l => /^[-+\s]+$/.test(l) && l.includes('-'));
  if (sepIdx < 1) return [];

  const dataLines = lines
    .slice(sepIdx + 1)
    .filter(l => !l.startsWith('('));  // skip "(N rows)" footer

  return dataLines.map(line => {
    const cells = line.split('|').map(c => c.trim());
    const row: Record<string, string> = {};
    columns.forEach((col, i) => {
      row[col] = cells[i] ?? '';
    });
    return row;
  });
}

function queryEvents(cwd: string, whereExtra: string, limit: number): XtrmEvent[] {
  const cols = 'id, created_at, runtime, session_id, worktree, layer, kind, outcome, tool_name, issue_id';
  const colNames = ['id', 'created_at', 'runtime', 'session_id', 'worktree', 'layer', 'kind', 'outcome', 'tool_name', 'issue_id'];

  const where = whereExtra ? `WHERE ${whereExtra}` : '';
  const sql = `SELECT ${cols} FROM xtrm_events ${where} ORDER BY created_at ASC, id ASC LIMIT ${limit}`;

  const result = spawnSync('bd', ['sql', sql], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 8000,
  });

  if (result.status !== 0) return [];

  const rows = parseBdTable(result.stdout, colNames);
  return rows.map(r => ({
    id: r.id,
    created_at: r.created_at,
    runtime: r.runtime,
    session_id: r.session_id,
    worktree: r.worktree === '<nil>' || !r.worktree ? null : r.worktree,
    layer: r.layer,
    kind: r.kind,
    outcome: r.outcome,
    tool_name: r.tool_name === '<nil>' || !r.tool_name ? null : r.tool_name,
    issue_id: r.issue_id === '<nil>' || !r.issue_id ? null : r.issue_id,
  }));
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtTime(created_at: string): string {
  // created_at format from Dolt: "2026-03-21 14:32:01 +0000 UTC" or similar
  try {
    const d = new Date(created_at);
    if (isNaN(d.getTime())) return created_at.slice(11, 19) || '??:??:??';
    return d.toLocaleTimeString('en-GB', { hour12: false });
  } catch {
    return created_at.slice(11, 19) || '??:??:??';
  }
}

function fmtKind(kind: string, outcome: string): string {
  const dot = outcome === 'block' ? kleur.red('●') : kleur.green('○');
  const label = kind.padEnd(36);
  const colored = outcome === 'block' ? kleur.red(label) : kleur.green(label);
  return `${dot} ${colored}`;
}

function fmtSession(sessionId: string): string {
  // Show first 8 chars of UUID, or full PID string
  const short = sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId;
  return kleur.dim(short);
}

function fmtMeta(event: XtrmEvent): string {
  const parts: string[] = [];
  if (event.tool_name) parts.push(kleur.cyan(event.tool_name.padEnd(10)));
  if (event.issue_id) parts.push(kleur.yellow(event.issue_id));
  if (event.worktree) parts.push(kleur.dim(`[${event.worktree}]`));
  return parts.join('  ') || kleur.dim('—');
}

function printEvent(event: XtrmEvent): void {
  const time = kleur.dim(`[${fmtTime(event.created_at)}]`);
  const session = fmtSession(event.session_id);
  const kind = fmtKind(event.kind, event.outcome);
  const meta = fmtMeta(event);
  console.log(`  ${time} ${session}  ${kind}  ${meta}`);
}

function printHeader(): void {
  const h = kleur.dim;
  const col = (s: string, w: number) => s.padEnd(w);
  console.log(
    `  ${h(col('[TIME]', 10))} ${h(col('SESSION', 10))}  ${h('●/○')} ${h(col('KIND', 37))}  ${h('TOOL/ISSUE')}`
  );
  console.log(`  ${kleur.dim('─'.repeat(90))}`);
}

// ── Watch mode ────────────────────────────────────────────────────────────────

function buildWhereClause(opts: DebugOptions, sinceTs: string | null): string {
  const clauses: string[] = [];

  if (sinceTs) {
    clauses.push(`created_at >= '${sinceTs}'`);
  }
  if (opts.session) {
    // Support partial match (first 8 chars of UUID)
    const s = opts.session.replace(/'/g, "''");
    clauses.push(`session_id LIKE '${s}%'`);
  }
  if (opts.type) {
    const layer = opts.type.replace(/'/g, "''");
    clauses.push(`layer = '${layer}'`);
  }

  return clauses.join(' AND ');
}

function watch(cwd: string, opts: DebugOptions): void {
  const seenIds = new Set<string>();
  let lastTs: string | null = null;

  // Initial query: last 5 minutes
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);

  const initialWhere = buildWhereClause(opts, fiveMinsAgo);
  const initial = queryEvents(cwd, initialWhere, 200);

  if (initial.length > 0) {
    for (const ev of initial) {
      seenIds.add(ev.id);
      if (!lastTs || ev.created_at > lastTs) lastTs = ev.created_at;
      if (opts.json) {
        console.log(JSON.stringify(ev));
      } else {
        printEvent(ev);
      }
    }
  } else {
    if (!opts.json) console.log(kleur.dim('  (no recent events — waiting for new ones)\n'));
  }

  // Poll every 2s for new events
  const interval = setInterval(() => {
    // Query from last seen timestamp (with 2s overlap to avoid missing same-second events)
    const overlapTs = lastTs
      ? new Date(new Date(lastTs.replace(' +0000 UTC', 'Z')).getTime() - 2000)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 19)
      : new Date(Date.now() - 10000).toISOString().replace('T', ' ').slice(0, 19);

    const where = buildWhereClause(opts, overlapTs);
    const events = queryEvents(cwd, where, 50);

    const newEvents = events.filter(ev => !seenIds.has(ev.id));
    for (const ev of newEvents) {
      seenIds.add(ev.id);
      if (!lastTs || ev.created_at > lastTs) lastTs = ev.created_at;
      if (opts.json) {
        console.log(JSON.stringify(ev));
      } else {
        printEvent(ev);
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
    .option('--all', 'Show full history instead of watching', false)
    .option('--session <id>', 'Filter by session ID (prefix match)')
    .option('--type <layer>', 'Filter by layer: gate | bd')
    .option('--json', 'Output raw JSON lines', false)
    .action((opts: DebugOptions) => {
      const cwd = process.cwd();
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
          console.log(kleur.dim('  Watching for events — Ctrl+C to stop\n'));
        }
        printHeader();
      }

      if (opts.all) {
        // One-shot: fetch last 200 events and exit
        const where = buildWhereClause(opts, null);
        const events = queryEvents(root, where, 200);
        if (events.length === 0) {
          if (!opts.json) {
            console.log(kleur.dim('\n  No events recorded yet.'));
            console.log(kleur.dim('  Events appear here as hooks fire and bd lifecycle runs.\n'));
          }
        } else {
          for (const ev of events) {
            if (opts.json) {
              console.log(JSON.stringify(ev));
            } else {
              printEvent(ev);
            }
          }
          if (!opts.json) console.log('');
        }
        return;
      }

      // Watch mode: runs until Ctrl+C
      watch(root, opts);
    });
}
