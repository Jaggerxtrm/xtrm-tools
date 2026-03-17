#!/usr/bin/env node
// compile-policies.mjs — generate hooks/hooks.json from policies/*.json
//
// Usage:
//   node scripts/compile-policies.mjs           # write hooks/hooks.json
//   node scripts/compile-policies.mjs --dry-run # print output, no write
//   node scripts/compile-policies.mjs --check   # exit 1 if hooks.json would change
//
// Policy files: policies/*.json (schema: policies/schema.json)
// Output:       hooks/hooks.json

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const POLICIES_DIR = join(ROOT, 'policies');
const OUTPUT_FILE = join(ROOT, 'hooks', 'hooks.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CHECK = args.includes('--check');

// ── Load and sort policy files ────────────────────────────────────────────────

const policyFiles = readdirSync(POLICIES_DIR)
  .filter(f => f.endsWith('.json') && f !== 'schema.json')
  .sort(); // alphabetical within same order value

const policies = policyFiles.map(f => {
  const content = JSON.parse(readFileSync(join(POLICIES_DIR, f), 'utf8'));
  return { file: f, ...content };
});

// Sort by `order` field (default 50), then by filename for stability
policies.sort((a, b) => {
  const oa = a.order ?? 50;
  const ob = b.order ?? 50;
  if (oa !== ob) return oa - ob;
  return a.file.localeCompare(b.file);
});

// ── Build hooks.json ──────────────────────────────────────────────────────────
// Structure: { hooks: { EventName: [ { matcher?, hooks: [ { type, command, timeout? } ] } ] } }
//
// Groups are keyed by (event, matcher). Multiple policies can contribute to
// the same group — their hook entries are appended in policy order.

const eventGroups = new Map(); // key: "EventName\0matcher" → array of hook entries

for (const policy of policies) {
  const runtime = policy.runtime ?? 'both';
  if (runtime === 'pi') continue; // Claude-only output; skip pi-only policies

  const hooks = policy.claude?.hooks ?? [];
  for (const hook of hooks) {
    const key = `${hook.event}\0${hook.matcher ?? ''}`;
    if (!eventGroups.has(key)) eventGroups.set(key, []);
    const entry = { type: 'command', command: hook.command };
    if (hook.timeout != null) entry.timeout = hook.timeout;
    eventGroups.get(key).push(entry);
  }
}

// Assemble final structure, preserving event insertion order
const hooksOutput = {};
for (const [key, hookEntries] of eventGroups) {
  const [event, matcher] = key.split('\0');
  if (!hooksOutput[event]) hooksOutput[event] = [];
  const group = matcher ? { matcher, hooks: hookEntries } : { hooks: hookEntries };
  hooksOutput[event].push(group);
}

const output = JSON.stringify({ hooks: hooksOutput }, null, 2) + '\n';

// ── Output ────────────────────────────────────────────────────────────────────

if (DRY_RUN) {
  process.stdout.write(output);
  process.exit(0);
}

if (CHECK) {
  const current = readFileSync(OUTPUT_FILE, 'utf8');
  if (current === output) {
    console.log('✓ hooks/hooks.json is up to date');
    process.exit(0);
  } else {
    console.error('✗ hooks/hooks.json is out of sync with policies/');
    console.error('  Run: node scripts/compile-policies.mjs');
    process.exit(1);
  }
}

writeFileSync(OUTPUT_FILE, output);
console.log(`✓ Generated hooks/hooks.json from ${policies.length} policies`);
policies.forEach(p => {
  const count = (p.claude?.hooks ?? []).length;
  if (count > 0) console.log(`  ${p.file}: ${count} hook(s)`);
});
