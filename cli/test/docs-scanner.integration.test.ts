import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { scanDocFiles } from '../src/utils/docs-scanner.js';
import { readCache, writeCache, isCacheValid } from '../src/utils/docs-cache.js';

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xtrm-docs-test-'));
});

afterEach(async () => {
    await fs.remove(tmpDir);
});

// ── scanDocFiles ──────────────────────────────────────────────────────────────

describe('scanDocFiles', () => {
    it('returns [] for empty directory', async () => {
        const results = await scanDocFiles(tmpDir);
        expect(results).toEqual([]);
    });

    it('finds .md files recursively in nested dirs', async () => {
        await fs.outputFile(path.join(tmpDir, 'README.md'), '# Root');
        await fs.outputFile(path.join(tmpDir, 'docs', 'guide.md'), '# Guide');
        await fs.outputFile(path.join(tmpDir, 'docs', 'sub', 'deep.md'), '# Deep');

        const results = await scanDocFiles(tmpDir);
        const paths = results.map(r => r.relativePath).sort();
        expect(paths).toContain('README.md');
        expect(paths).toContain('docs/guide.md');
        expect(paths).toContain('docs/sub/deep.md');
    });

    it('does not return non-.md files', async () => {
        await fs.outputFile(path.join(tmpDir, 'script.ts'), 'export {}');
        await fs.outputFile(path.join(tmpDir, 'note.txt'), 'hello');
        await fs.outputFile(path.join(tmpDir, 'README.md'), '# Readme');

        const results = await scanDocFiles(tmpDir);
        expect(results.map(r => r.relativePath)).toEqual(['README.md']);
    });

    it('always excludes node_modules/', async () => {
        await fs.outputFile(path.join(tmpDir, 'node_modules', 'pkg', 'README.md'), '# pkg');
        await fs.outputFile(path.join(tmpDir, 'README.md'), '# Root');

        const results = await scanDocFiles(tmpDir);
        expect(results.map(r => r.relativePath)).not.toContain('node_modules/pkg/README.md');
        expect(results.map(r => r.relativePath)).toContain('README.md');
    });

    it('always excludes .git/', async () => {
        await fs.outputFile(path.join(tmpDir, '.git', 'COMMIT_EDITMSG'), '# msg');
        await fs.outputFile(path.join(tmpDir, '.git', 'notes.md'), '# git notes');
        await fs.outputFile(path.join(tmpDir, 'README.md'), '# Root');

        const results = await scanDocFiles(tmpDir);
        expect(results.every(r => !r.relativePath.startsWith('.git/'))).toBe(true);
    });

    it('respects .gitignore — excludes dist/ when listed', async () => {
        await fs.outputFile(path.join(tmpDir, '.gitignore'), 'dist/\n');
        await fs.outputFile(path.join(tmpDir, 'dist', 'output.md'), '# built');
        await fs.outputFile(path.join(tmpDir, 'README.md'), '# Root');

        const results = await scanDocFiles(tmpDir);
        expect(results.map(r => r.relativePath)).not.toContain('dist/output.md');
        expect(results.map(r => r.relativePath)).toContain('README.md');
    });

    it('--dir filter returns only files under that prefix', async () => {
        await fs.outputFile(path.join(tmpDir, 'README.md'), '# Root');
        await fs.outputFile(path.join(tmpDir, 'docs', 'guide.md'), '# Guide');
        await fs.outputFile(path.join(tmpDir, 'other', 'note.md'), '# Note');

        const results = await scanDocFiles(tmpDir, { dir: 'docs' });
        expect(results.map(r => r.relativePath)).toEqual(['docs/guide.md']);
    });

    it('--pattern filter returns only files matching filename substring', async () => {
        await fs.outputFile(path.join(tmpDir, 'README.md'), '# Readme');
        await fs.outputFile(path.join(tmpDir, 'CHANGELOG.md'), '# Changelog');
        await fs.outputFile(path.join(tmpDir, 'docs', 'readme-extra.md'), '# Extra');

        const results = await scanDocFiles(tmpDir, { pattern: 'README' });
        const paths = results.map(r => r.relativePath);
        expect(paths).toContain('README.md');
        expect(paths).not.toContain('CHANGELOG.md');
    });

    it('--filter field=value returns only files with matching frontmatter', async () => {
        await fs.outputFile(path.join(tmpDir, 'a.md'), '---\ntype: service\n---\n');
        await fs.outputFile(path.join(tmpDir, 'b.md'), '---\ntype: guide\n---\n');
        await fs.outputFile(path.join(tmpDir, 'c.md'), '# No frontmatter');

        const results = await scanDocFiles(tmpDir, { filter: { field: 'type', value: 'service' } });
        expect(results.map(r => r.relativePath)).toEqual(['a.md']);
    });
});

// ── docs-cache ────────────────────────────────────────────────────────────────

describe('docs-cache', () => {
    it('readCache returns null when cache file does not exist', async () => {
        const result = await readCache(tmpDir);
        expect(result).toBeNull();
    });

    it('readCache returns null for invalid JSON', async () => {
        const cachePath = path.join(tmpDir, '.xtrm', 'cache', 'docs-list.json');
        await fs.ensureDir(path.dirname(cachePath));
        await fs.writeFile(cachePath, 'not json');
        expect(await readCache(tmpDir)).toBeNull();
    });

    it('writeCache creates the cache file at .xtrm/cache/docs-list.json', async () => {
        await writeCache(tmpDir, []);
        const cachePath = path.join(tmpDir, '.xtrm', 'cache', 'docs-list.json');
        expect(await fs.pathExists(cachePath)).toBe(true);
    });

    it('readCache returns the written entries', async () => {
        const entries = [{
            filePath: path.join(tmpDir, 'README.md'),
            relativePath: 'README.md',
            frontmatter: { title: 'Test' },
            sizeBytes: 100,
            lastModified: new Date('2026-01-01'),
        }];
        await writeCache(tmpDir, entries as any);
        const cache = await readCache(tmpDir);
        expect(cache).not.toBeNull();
        expect(cache!.entries[0].relativePath).toBe('README.md');
        expect(cache!.entries[0].lastModified).toBeInstanceOf(Date);
    });

    it('isCacheValid returns false when TTL exceeded', async () => {
        await writeCache(tmpDir, []);
        const cache = await readCache(tmpDir);
        // Backdate the timestamp
        cache!.timestamp = Date.now() - 120_000;
        expect(isCacheValid(cache!, [], 60_000)).toBe(false);
    });

    it('isCacheValid returns true when age < TTL and no files are newer', async () => {
        await writeCache(tmpDir, []);
        const cache = await readCache(tmpDir);
        const entries = [{ lastModified: new Date(cache!.timestamp - 1000) }];
        expect(isCacheValid(cache!, entries as any, 60_000)).toBe(true);
    });

    it('isCacheValid returns false when a file is newer than cache timestamp', async () => {
        await writeCache(tmpDir, []);
        const cache = await readCache(tmpDir);
        const entries = [{ lastModified: new Date(cache!.timestamp + 5000) }];
        expect(isCacheValid(cache!, entries as any, 60_000)).toBe(false);
    });
});
