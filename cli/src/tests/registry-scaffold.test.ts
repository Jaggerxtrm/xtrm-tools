import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSkillsDefaultPath,
  scaffoldSkillsDefaultFromPackage,
  stripXtrmPrefix,
  toPosix,
  toUserRelativePath,
} from '../core/registry-scaffold.js';
import { ensureAgentsSkillsSymlink } from '../core/skills-scaffold.js';

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

async function createTempDir(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xtrm-scaffold-test-'));
  tempDirs.push(tempDir);
  return tempDir;
}

describe('registry-scaffold path helpers', () => {
  it('toPosix converts windows-style separators to posix', () => {
    expect(toPosix('skills\\default\\README.md')).toBe('skills/default/README.md');
  });

  it('toPosix leaves already-posix paths unchanged', () => {
    expect(toPosix('skills/default/README.md')).toBe('skills/default/README.md');
  });

  it('stripXtrmPrefix strips .xtrm/foo/bar correctly', () => {
    expect(stripXtrmPrefix('.xtrm/foo/bar')).toBe('foo/bar');
  });

  it('stripXtrmPrefix strips .xtrm/ prefix exactly', () => {
    expect(stripXtrmPrefix('.xtrm/')).toBe('');
  });

  it('stripXtrmPrefix returns unchanged path when no .xtrm prefix is present', () => {
    expect(stripXtrmPrefix('hooks/post-tool-use.mjs')).toBe('hooks/post-tool-use.mjs');
  });

  it('toUserRelativePath joins sourceDir + filePath with posix separators', () => {
    expect(toUserRelativePath('.xtrm/skills/default', 'foo.md')).toBe('skills/default/foo.md');
  });

  it('toUserRelativePath strips .xtrm prefix before joining', () => {
    expect(toUserRelativePath('.xtrm/hooks', 'post-tool-use.mjs')).toBe('hooks/post-tool-use.mjs');
  });

  it('isSkillsDefaultPath returns true for skills/default paths', () => {
    expect(isSkillsDefaultPath('skills/default/README.md')).toBe(true);
  });

  it('isSkillsDefaultPath returns false for hooks paths', () => {
    expect(isSkillsDefaultPath('hooks/post-tool-use.mjs')).toBe(false);
  });

  it('isSkillsDefaultPath returns false for config paths', () => {
    expect(isSkillsDefaultPath('config/settings.json')).toBe(false);
  });
});

describe('scaffoldSkillsDefaultFromPackage', () => {
  it('returns symlink when targetDir does not exist', async () => {
    const tempDir = await createTempDir();
    const packageRoot = path.join(tempDir, 'pkg');
    const userXtrmDir = path.join(tempDir, 'user-xtrm');
    const sourceDir = path.join(packageRoot, '.xtrm', 'skills', 'default');

    await fs.ensureDir(sourceDir);
    await fs.writeFile(path.join(sourceDir, 'README.md'), '# skill\n', 'utf8');

    const result = await scaffoldSkillsDefaultFromPackage({
      packageRoot,
      userXtrmDir,
      dryRun: false,
    });

    expect(result).toBe('symlink');
  });

  it('returns noop when targetDir already exists', async () => {
    const tempDir = await createTempDir();
    const packageRoot = path.join(tempDir, 'pkg');
    const userXtrmDir = path.join(tempDir, 'user-xtrm');
    const sourceDir = path.join(packageRoot, '.xtrm', 'skills', 'default');
    const targetDir = path.join(userXtrmDir, 'skills', 'default');

    await fs.ensureDir(sourceDir);
    await fs.ensureDir(targetDir);

    const result = await scaffoldSkillsDefaultFromPackage({
      packageRoot,
      userXtrmDir,
      dryRun: false,
    });

    expect(result).toBe('noop');
  });

  it('returns noop in dry-run mode', async () => {
    const tempDir = await createTempDir();
    const packageRoot = path.join(tempDir, 'pkg');
    const userXtrmDir = path.join(tempDir, 'user-xtrm');
    const sourceDir = path.join(packageRoot, '.xtrm', 'skills', 'default');

    await fs.ensureDir(sourceDir);

    const result = await scaffoldSkillsDefaultFromPackage({
      packageRoot,
      userXtrmDir,
      dryRun: true,
    });

    expect(result).toBe('noop');
    expect(await fs.pathExists(path.join(userXtrmDir, 'skills', 'default'))).toBe(false);
  });
});

describe('ensureAgentsSkillsSymlink', () => {
  const itIfSymlinkSupported = process.platform === 'win32' ? it.skip : it;

  itIfSymlinkSupported('creates .agents/skills and .claude/skills symlinks to .xtrm/skills/default', async () => {
    const tempDir = await createTempDir();
    const sourceDir = path.join(tempDir, '.xtrm', 'skills', 'default');
    const expectedTarget = path.join('..', '.xtrm', 'skills', 'default');

    await fs.ensureDir(sourceDir);

    await ensureAgentsSkillsSymlink(tempDir);

    const agentsLink = path.join(tempDir, '.agents', 'skills');
    const claudeLink = path.join(tempDir, '.claude', 'skills');

    expect((await fs.lstat(agentsLink)).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(claudeLink)).isSymbolicLink()).toBe(true);
    expect(await fs.readlink(agentsLink)).toBe(expectedTarget);
    expect(await fs.readlink(claudeLink)).toBe(expectedTarget);
  });

  it('skips when .xtrm/skills/default does not exist', async () => {
    const tempDir = await createTempDir();

    await ensureAgentsSkillsSymlink(tempDir);

    expect(await fs.pathExists(path.join(tempDir, '.agents', 'skills'))).toBe(false);
    expect(await fs.pathExists(path.join(tempDir, '.claude', 'skills'))).toBe(false);
  });

  itIfSymlinkSupported('is idempotent and logs already in place on second call', async () => {
    const tempDir = await createTempDir();
    const sourceDir = path.join(tempDir, '.xtrm', 'skills', 'default');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await fs.ensureDir(sourceDir);

    await ensureAgentsSkillsSymlink(tempDir);
    logSpy.mockClear();
    await ensureAgentsSkillsSymlink(tempDir);

    const messages = logSpy.mock.calls.map(([message]) => String(message));
    expect(messages.some(message => message.includes('.agents/skills symlink already in place'))).toBe(true);
    expect(messages.some(message => message.includes('.claude/skills symlink already in place'))).toBe(true);
  });

  itIfSymlinkSupported('does not overwrite existing real directory and warns', async () => {
    const tempDir = await createTempDir();
    const sourceDir = path.join(tempDir, '.xtrm', 'skills', 'default');
    const agentsSkillsDir = path.join(tempDir, '.agents', 'skills');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await fs.ensureDir(sourceDir);
    await fs.ensureDir(agentsSkillsDir);
    await fs.writeFile(path.join(agentsSkillsDir, 'local.txt'), 'local', 'utf8');

    await ensureAgentsSkillsSymlink(tempDir);

    expect((await fs.lstat(agentsSkillsDir)).isDirectory()).toBe(true);
    expect(await fs.pathExists(path.join(agentsSkillsDir, 'local.txt'))).toBe(true);

    const messages = logSpy.mock.calls.map(([message]) => String(message));
    expect(messages.some(message => message.includes('.agents/skills is a real directory — skipping symlink'))).toBe(true);
  });
});
