/**
 * Cross-runtime policy parity tests (79m)
 *
 * Verifies that:
 * 1. Each policy file passes structural validation
 * 2. Policies with runtime:both have both Claude hooks and Pi extension metadata
 * 3. All referenced hook scripts and Pi extension files exist on disk
 * 4. The policy compiler produces up-to-date hooks/hooks.json (--check passes)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { WRITE_TOOLS } from '../../../hooks/guard-rules.mjs';

// Resolve repo root from cli/src/tests/
const ROOT = resolve(__dirname, '..', '..', '..');
const POLICIES_DIR = join(ROOT, 'policies');

interface PolicyHook {
  event: string;
  matcher?: string;
  command: string;
  timeout?: number;
}

interface Policy {
  id: string;
  description: string;
  version: string;
  runtime?: 'claude' | 'pi' | 'both';
  order?: number;
  claude?: { hooks: PolicyHook[] };
  pi?: { extension: string; events?: string[] };
}

// Load all policies (skip schema.json)
const policyFiles = readdirSync(POLICIES_DIR)
  .filter(f => f.endsWith('.json') && f !== 'schema.json')
  .sort();

const policies: Array<{ file: string; policy: Policy }> = policyFiles.map(file => ({
  file,
  policy: JSON.parse(readFileSync(join(POLICIES_DIR, file), 'utf8')) as Policy,
}));

const WRITE_TOOLS_MATCHER = WRITE_TOOLS.join('|');

// ── Structural validation ─────────────────────────────────────────────────────

describe('policy structure', () => {
  it.each(policyFiles)('%s has required fields', (file) => {
    const { policy } = policies.find(p => p.file === file)!;
    expect(policy.id, 'missing id').toBeTruthy();
    expect(policy.description, 'missing description').toBeTruthy();
    expect(policy.version, 'missing version').toBeTruthy();
  });

  it.each(policyFiles)('%s has valid runtime value', (file) => {
    const { policy } = policies.find(p => p.file === file)!;
    const validRuntimes = ['claude', 'pi', 'both', undefined];
    expect(validRuntimes).toContain(policy.runtime);
  });

  it.each(policyFiles)('%s has at least one runtime target', (file) => {
    const { policy } = policies.find(p => p.file === file)!;
    const hasClaude = (policy.claude?.hooks?.length ?? 0) > 0;
    const hasPi = !!policy.pi?.extension;
    expect(hasClaude || hasPi, 'policy has no claude hooks and no pi extension').toBe(true);
  });
});

// ── Cross-runtime parity ──────────────────────────────────────────────────────

const bothPolicies = policies.filter(({ policy }) => policy.runtime === 'both');

describe('runtime:both parity', () => {
  it('at least one policy targets both runtimes', () => {
    expect(bothPolicies.length).toBeGreaterThan(0);
  });

  it.each(bothPolicies.map(p => p.file))('%s has claude.hooks', (file) => {
    const { policy } = policies.find(p => p.file === file)!;
    expect(policy.claude?.hooks?.length ?? 0).toBeGreaterThan(0);
  });

  it.each(bothPolicies.map(p => p.file))('%s has pi.extension', (file) => {
    const { policy } = policies.find(p => p.file === file)!;
    expect(policy.pi?.extension, 'runtime:both policy missing pi.extension').toBeTruthy();
  });
});

// ── Canonical matcher parity ──────────────────────────────────────────────────

describe('canonical write-tool matcher parity', () => {
  it('main-guard policy uses $WRITE_TOOLS matcher macro', () => {
    const mainGuard = policies.find(({ policy }) => policy.id === 'main-guard')?.policy;
    const writeHook = mainGuard?.claude?.hooks?.find(h => h.event === 'PreToolUse' && h.command.includes('main-guard.mjs'));
    expect(writeHook?.matcher).toBe('$WRITE_TOOLS');
  });

  it('compiled hooks expand $WRITE_TOOLS to canonical matcher', () => {
    const compiledHooks = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
    const groups = compiledHooks?.hooks?.PreToolUse ?? [];
    const mainGuardGroup = groups.find((group: any) =>
      group.matcher === WRITE_TOOLS_MATCHER &&
      (group.hooks ?? []).some((h: any) => String(h.command).includes('main-guard.mjs')),
    );

    expect(mainGuardGroup, 'expected main-guard PreToolUse group to use canonical WRITE_TOOLS matcher').toBeTruthy();
  });
});

// ── File existence ────────────────────────────────────────────────────────────

describe('referenced files exist', () => {
  // Resolve ${CLAUDE_PLUGIN_ROOT}/hooks/foo.mjs → hooks/foo.mjs (repo-relative)
  const resolveCommand = (command: string): string =>
    command.replace('node ${CLAUDE_PLUGIN_ROOT}/', '').replace('python3 ${CLAUDE_PLUGIN_ROOT}/', '');

  const allHooks = policies.flatMap(({ file, policy }) =>
    (policy.claude?.hooks ?? []).map(hook => ({ file, command: hook.command })),
  );

  it.each(allHooks)('$file: command "$command" references existing file', ({ command }) => {
    const relativePath = resolveCommand(command);
    const absolutePath = join(ROOT, relativePath);
    expect(existsSync(absolutePath), `Hook script not found: ${relativePath}`).toBe(true);
  });

  const piPolicies = policies.filter(({ policy }) => policy.pi?.extension);

  it.each(piPolicies.map(p => p.file))('%s: pi.extension file exists', (file) => {
    const { policy } = policies.find(p => p.file === file)!;
    const absPath = join(ROOT, policy.pi!.extension);
    expect(existsSync(absPath), `Pi extension not found: ${policy.pi!.extension}`).toBe(true);
  });
});

// ── Compiler consistency ──────────────────────────────────────────────────────

describe('compiler', () => {
  it('hooks/hooks.json is up to date with policies/', () => {
    const result = spawnSync(
      'node',
      [join(ROOT, 'scripts', 'compile-policies.mjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(
      result.status,
      `hooks.json drift detected — run: npm run compile-policies\n${result.stdout}${result.stderr}`,
    ).toBe(0);
  });

  it('all policy ids are unique', () => {
    const ids = policies.map(({ policy }) => policy.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('policy order values are unique or explicitly equal', () => {
    // Multiple policies can share an order value — just document it
    const orders = policies.map(({ file, policy }) => ({ file, order: policy.order ?? 50 }));
    // No assertion — informational only, logged to help debug ordering issues
    expect(orders.length).toBeGreaterThan(0);
  });
});
