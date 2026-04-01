import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPluginEraCleanup } from '../core/plugin-era-cleanup.js';

let tmpDir = '';
let projectRoot = '';
let previousHome: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xtrm-prune-test-'));
  projectRoot = path.join(tmpDir, 'project');
  await fs.ensureDir(projectRoot);

  previousHome = process.env.HOME;
  process.env.HOME = path.join(tmpDir, 'home');

  await seedPluginEraArtifacts({ projectRoot, homeDir: process.env.HOME });
});

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }

  await fs.remove(tmpDir);
});

async function seedPluginEraArtifacts(params: { projectRoot: string; homeDir: string }): Promise<void> {
  const { projectRoot, homeDir } = params;

  await fs.ensureDir(path.join(homeDir, '.claude', 'plugins', 'cache'));
  await fs.writeJson(path.join(homeDir, '.claude', 'settings.json'), {
    permissions: { allow: ['Bash(git status)'], defaultMode: 'acceptEdits' },
    model: 'claude-sonnet-4-5',
    hooks: { PostToolUse: [] },
    skillSuggestions: { enabled: false },
    statusLine: { type: 'command', command: 'echo ok' },
    enabledPlugins: { 'xtrm-tools@xtrm-tools': true },
    extraKnownMarketplaces: { 'xtrm-tools': { source: { source: 'directory', path: '/tmp/x' } } },
  }, { spaces: 2 });
  await fs.ensureDir(path.join(homeDir, '.claude', 'skills', 'old-skill'));
  await fs.ensureDir(path.join(homeDir, '.claude', 'hooks'));

  await fs.ensureDir(path.join(homeDir, '.pi', 'agent', 'extensions', 'beads'));
  await fs.ensureDir(path.join(homeDir, '.pi', 'agent', 'extensions', 'custom-ext'));

  await fs.ensureDir(path.join(homeDir, '.agents', 'skills', 'clean-code'));
  await fs.ensureDir(path.join(homeDir, '.agents', 'skills', 'my-custom-skill'));

  await fs.ensureDir(path.join(projectRoot, '.claude'));
  await fs.writeJson(path.join(projectRoot, '.claude', 'settings.json'), {
    permissions: { allow: ['Read(README.md)'] },
    model: 'claude-opus-4-1',
    enabledPlugins: { 'xtrm-tools@xtrm-tools': true },
    extraKnownMarketplaces: { xtrm: true },
  }, { spaces: 2 });

  await fs.ensureDir(path.join(projectRoot, '.claude', 'hooks'));
  await fs.writeFile(path.join(projectRoot, '.claude', 'hooks', 'quality-check.cjs'), '// legacy\n');
  await fs.writeFile(path.join(projectRoot, '.claude', 'hooks', 'specialists-complete.mjs'), '// legacy specialists\n');

  await fs.ensureDir(path.join(projectRoot, '.xtrm', 'hooks'));
  await fs.writeFile(path.join(projectRoot, '.xtrm', 'hooks', 'quality-check.cjs'), '// canonical\n');
  await fs.ensureDir(path.join(projectRoot, '.xtrm', 'config'));
  await fs.writeJson(path.join(projectRoot, '.xtrm', 'config', 'hooks.json'), { hooks: {} }, { spaces: 2 });

  await fs.ensureDir(path.join(projectRoot, '.xtrm', 'skills', 'default', 'clean-code'));
}

describe('runPluginEraCleanup', () => {
  it('shows prune plan in dry-run without mutating files', async () => {
    const result = await runPluginEraCleanup({
      dryRun: true,
      yes: true,
      scope: 'all',
      repoRoot: projectRoot,
    });

    expect(result.planned.length).toBeGreaterThan(0);
    expect(await fs.pathExists(path.join(process.env.HOME as string, '.claude', 'plugins'))).toBe(true);

    const globalSettings = await fs.readJson(path.join(process.env.HOME as string, '.claude', 'settings.json')) as Record<string, unknown>;
    expect(globalSettings.enabledPlugins).toBeTruthy();
    expect(globalSettings.extraKnownMarketplaces).toBeTruthy();
  });

  it('removes only plugin-era artifacts in prune mode and preserves custom entries', async () => {
    await runPluginEraCleanup({
      dryRun: false,
      yes: true,
      scope: 'all',
      repoRoot: projectRoot,
    });

    const homeDir = process.env.HOME as string;

    expect(await fs.pathExists(path.join(homeDir, '.claude', 'plugins'))).toBe(false);
    expect(await fs.pathExists(path.join(homeDir, '.claude', 'skills'))).toBe(false);
    expect(await fs.pathExists(path.join(homeDir, '.claude', 'hooks'))).toBe(false);

    const globalSettings = await fs.readJson(path.join(homeDir, '.claude', 'settings.json')) as Record<string, unknown>;
    expect(globalSettings.permissions).toBeTruthy();
    expect(globalSettings.model).toBe('claude-sonnet-4-5');
    expect(globalSettings.hooks).toBeTruthy();
    expect(globalSettings.skillSuggestions).toBeTruthy();
    expect(globalSettings.statusLine).toBeTruthy();
    expect(globalSettings.enabledPlugins).toBeUndefined();
    expect(globalSettings.extraKnownMarketplaces).toBeUndefined();

    expect(await fs.pathExists(path.join(homeDir, '.pi', 'agent', 'extensions', 'beads'))).toBe(false);
    expect(await fs.pathExists(path.join(homeDir, '.pi', 'agent', 'extensions', 'custom-ext'))).toBe(true);

    expect(await fs.pathExists(path.join(homeDir, '.agents', 'skills', 'clean-code'))).toBe(false);
    expect(await fs.pathExists(path.join(homeDir, '.agents', 'skills', 'my-custom-skill'))).toBe(true);

    const projectSettings = await fs.readJson(path.join(projectRoot, '.claude', 'settings.json')) as Record<string, unknown>;
    expect(projectSettings.enabledPlugins).toBeUndefined();
    expect(projectSettings.extraKnownMarketplaces).toBeUndefined();

    expect(await fs.pathExists(path.join(projectRoot, '.claude', 'hooks', 'quality-check.cjs'))).toBe(false);
    expect(await fs.pathExists(path.join(projectRoot, '.claude', 'hooks', 'specialists-complete.mjs'))).toBe(true);
  });
});
