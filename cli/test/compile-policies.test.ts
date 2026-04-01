import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/compile-policies.mjs');
const HOOKS_OUTPUT = path.join(REPO_ROOT, '.xtrm', 'config', 'hooks.json');
const POLICIES_DIR = path.join(REPO_ROOT, 'policies');

function runCompiler(args: string[]) {
  return spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
}

// ── Golden file ───────────────────────────────────────────────────────────────

describe('compile-policies — golden file', () => {
  it('--dry-run output matches .xtrm/config/hooks.json on disk', () => {
    const result = runCompiler(['--dry-run']);
    expect(result.status).toBe(0);
    const onDisk = readFileSync(HOOKS_OUTPUT, 'utf8');
    expect(result.stdout).toBe(onDisk);
  });
});

// ── --check flag ──────────────────────────────────────────────────────────────

describe('compile-policies — --check flag', () => {
  it('exits 0 when hooks.json is up to date', () => {
    const result = runCompiler(['--check']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('up to date');
  });

  it('exits 1 and reports error when hooks.json is stale', () => {
    const original = readFileSync(HOOKS_OUTPUT, 'utf8');
    try {
      writeFileSync(HOOKS_OUTPUT, JSON.stringify({ hooks: { _stale: true } }, null, 2) + '\n');
      const result = runCompiler(['--check']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('out of sync');
    } finally {
      writeFileSync(HOOKS_OUTPUT, original);
    }
  });
});

// ── --dry-run flag ────────────────────────────────────────────────────────────

describe('compile-policies — --dry-run flag', () => {
  it('prints valid JSON with hooks key to stdout', () => {
    const result = runCompiler(['--dry-run']);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('hooks');
  });

  it('does not modify hooks.json', () => {
    const before = readFileSync(HOOKS_OUTPUT, 'utf8');
    runCompiler(['--dry-run']);
    const after = readFileSync(HOOKS_OUTPUT, 'utf8');
    expect(after).toBe(before);
  });
});

// ── Write mode ────────────────────────────────────────────────────────────────

describe('compile-policies — write mode', () => {
  it('writes hooks.json and prints summary', () => {
    const original = readFileSync(HOOKS_OUTPUT, 'utf8');
    try {
      const result = runCompiler([]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Generated .xtrm/config/hooks.json');
      const written = readFileSync(HOOKS_OUTPUT, 'utf8');
      const parsed = JSON.parse(written);
      expect(parsed).toHaveProperty('hooks');
    } finally {
      writeFileSync(HOOKS_OUTPUT, original);
    }
  });
});

// ── Output structure ──────────────────────────────────────────────────────────

describe('compile-policies — output structure', () => {
  it('no null or empty string matchers in output', () => {
    const result = runCompiler(['--dry-run']);
    const parsed = JSON.parse(result.stdout);
    for (const groups of Object.values(parsed.hooks) as object[][]) {
      for (const group of groups) {
        const g = group as { matcher?: string };
        if ('matcher' in g) {
          expect(g.matcher).toBeTruthy();
        }
      }
    }
  });

  it('timeout field absent from entries that do not declare it', () => {
    const result = runCompiler(['--dry-run']);
    const parsed = JSON.parse(result.stdout);
    for (const groups of Object.values(parsed.hooks) as object[][]) {
      for (const group of groups) {
        const g = group as { hooks: { timeout?: unknown }[] };
        for (const entry of g.hooks ?? []) {
          if (!Object.prototype.hasOwnProperty.call(entry, 'timeout')) {
            expect(entry.timeout).toBeUndefined();
          }
        }
      }
    }
  });

  it('timeout field present when declared in policy', () => {
    const files = readdirSync(POLICIES_DIR).filter(f => f.endsWith('.json') && f !== 'schema.json');
    const hasTimeout = files.some(f => {
      const p = JSON.parse(readFileSync(path.join(POLICIES_DIR, f), 'utf8'));
      return (p.claude?.hooks ?? []).some((h: { timeout?: number }) => h.timeout != null);
    });
    if (!hasTimeout) return;

    const result = runCompiler(['--dry-run']);
    const parsed = JSON.parse(result.stdout);
    const allEntries = Object.values(parsed.hooks as object)
      .flatMap(groups => groups as object[])
      .flatMap(g => (g as { hooks: object[] }).hooks ?? []);
    expect(allEntries.some(e => 'timeout' in e)).toBe(true);
  });

  it('$WRITE_TOOLS macro is expanded — no raw macro in output', () => {
    const result = runCompiler(['--dry-run']);
    const parsed = JSON.parse(result.stdout);
    const allMatchers = Object.values(parsed.hooks as object)
      .flatMap(groups => groups as object[])
      .map(g => (g as { matcher?: string }).matcher)
      .filter(Boolean);

    for (const matcher of allMatchers) {
      expect(matcher).not.toContain('$WRITE_TOOLS');
    }
    expect(allMatchers.some(m => m?.includes('Edit'))).toBe(true);
  });

  it('runtime:pi policies are excluded from hooks output', () => {
    const files = readdirSync(POLICIES_DIR).filter(f => f.endsWith('.json') && f !== 'schema.json');
    const piOnlyCommands: string[] = [];
    for (const f of files) {
      const p = JSON.parse(readFileSync(path.join(POLICIES_DIR, f), 'utf8'));
      if (p.runtime === 'pi') {
        for (const hook of p.claude?.hooks ?? []) {
          piOnlyCommands.push(hook.command);
        }
      }
    }
    if (piOnlyCommands.length === 0) return;

    const result = runCompiler(['--dry-run']);
    for (const cmd of piOnlyCommands) {
      expect(result.stdout).not.toContain(cmd);
    }
  });

  it('SessionStart contains multiple hook entries from merged policies', () => {
    const result = runCompiler(['--dry-run']);
    const parsed = JSON.parse(result.stdout);
    const sessionStart = parsed.hooks['SessionStart'];
    expect(Array.isArray(sessionStart)).toBe(true);
    const allHooks = sessionStart.flatMap((g: { hooks: object[] }) => g.hooks ?? []);
    expect(allHooks.length).toBeGreaterThan(1);
  });
});
