import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { diffPackMetadataSkills, readPackMetadata } from '../core/pack-metadata.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

async function createTempPackRoot(packName: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xtrm-pack-meta-test-'));
  tempDirs.push(tempDir);

  const packRoot = path.join(tempDir, '.xtrm', 'skills', 'optional', packName);
  await fs.ensureDir(packRoot);
  return packRoot;
}

describe('pack-metadata', () => {
  it('validates that metadata name matches pack directory', async () => {
    const packRoot = await createTempPackRoot('expected-pack');
    await fs.writeJson(path.join(packRoot, 'PACK.json'), {
      schemaVersion: '1',
      name: 'other-pack',
      version: '1.0.0',
      description: 'broken',
      skills: [],
    });

    await expect(readPackMetadata(packRoot, 'optional')).rejects.toThrow("name must match directory 'expected-pack'");
  });

  it('diffs metadata skills against filesystem skills', () => {
    expect(diffPackMetadataSkills(['a', 'b'], ['b', 'c'])).toEqual({
      metadataOnlySkills: ['a'],
      filesystemOnlySkills: ['c'],
    });
  });
});
