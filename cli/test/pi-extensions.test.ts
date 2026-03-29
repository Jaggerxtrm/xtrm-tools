import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { syncManagedPiExtensions, diffPiExtensions, getInstalledPiPackages } from '../src/utils/pi-extensions.js';

async function makeExtension(baseDir: string, name: string, extraFiles: Record<string, string> = {}): Promise<void> {
    const extDir = path.join(baseDir, name);
    await fs.ensureDir(extDir);
    await fs.writeJson(path.join(extDir, 'package.json'), { name });
    await fs.writeFile(path.join(extDir, 'index.ts'), `export const ${name.replace(/[^a-zA-Z0-9_]/g, '_')} = 1;`);

    for (const [relativePath, content] of Object.entries(extraFiles)) {
        const absPath = path.join(extDir, relativePath);
        await fs.ensureDir(path.dirname(absPath));
        await fs.writeFile(absPath, content);
    }
}

describe('syncManagedPiExtensions', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('copies missing and stale extensions, skips up-to-date', async () => {
        const srcRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-ext-src-'));
        const dstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-ext-dst-'));

        await makeExtension(srcRoot, 'ext-a');
        await makeExtension(srcRoot, 'ext-b');
        await makeExtension(dstRoot, 'ext-a');

        const logs: string[] = [];
        const count = await syncManagedPiExtensions({
            sourceDir: srcRoot,
            targetDir: dstRoot,
            log: (message) => logs.push(message),
        });

        expect(count).toBe(2);
        expect(logs.some((m) => m.includes('skipped 1 up-to-date'))).toBe(true);
        expect(await fs.pathExists(path.join(dstRoot, 'ext-b', 'index.ts'))).toBe(true);

        await fs.remove(srcRoot);
        await fs.remove(dstRoot);
    });

    it('skips sync entirely when all extensions are up-to-date', async () => {
        const srcRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-ext-src-'));
        const dstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-ext-dst-'));

        await makeExtension(srcRoot, 'my-ext');
        await makeExtension(dstRoot, 'my-ext');

        const logs: string[] = [];
        const count = await syncManagedPiExtensions({
            sourceDir: srcRoot,
            targetDir: dstRoot,
            log: (message) => logs.push(message),
        });

        expect(count).toBe(1);
        expect(logs.some((m) => m.includes('All 1 extensions up-to-date, skipping sync'))).toBe(true);

        await fs.remove(srcRoot);
        await fs.remove(dstRoot);
    });

    it('supports dry-run without writing files', async () => {
        const srcRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-ext-src-'));
        const dstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-ext-dst-'));

        await makeExtension(srcRoot, 'quality-gates');

        const logs: string[] = [];
        const count = await syncManagedPiExtensions({
            sourceDir: srcRoot,
            targetDir: dstRoot,
            dryRun: true,
            log: (message) => logs.push(message),
        });

        expect(count).toBe(1);
        expect(await fs.pathExists(path.join(dstRoot, 'quality-gates'))).toBe(false);
        expect(logs.some((message) => message.includes('[DRY RUN]'))).toBe(true);

        await fs.remove(srcRoot);
        await fs.remove(dstRoot);
    });

    it('throws when source directory does not exist', async () => {
        await expect(syncManagedPiExtensions({
            sourceDir: '/nonexistent/path',
            targetDir: '/tmp/target',
        })).rejects.toThrow('Pi extensions source directory not found');
    });
});

describe('diffPiExtensions', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('detects missing, stale, and up-to-date extensions', async () => {
        const srcRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-diff-src-'));
        const dstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-diff-dst-'));

        await makeExtension(srcRoot, 'ext-a', { 'package.json': '{"v":2}', 'index.ts': 'export const a = 2;' });
        await makeExtension(srcRoot, 'ext-b');
        await makeExtension(srcRoot, 'ext-c');

        await makeExtension(dstRoot, 'ext-a', { 'package.json': '{"v":1}', 'index.ts': 'export const a = 1;' });
        await makeExtension(dstRoot, 'ext-c');

        const diff = await diffPiExtensions(srcRoot, dstRoot);

        expect(diff.missing).toEqual(['ext-b']);
        expect(diff.stale).toEqual(['ext-a']);
        expect(diff.upToDate).toEqual(['ext-c']);

        await fs.remove(srcRoot);
        await fs.remove(dstRoot);
    });

    it('detects nested-file drift inside an extension package', async () => {
        const fresh = await import('../src/utils/pi-extensions.js?t=nested-' + Date.now());

        const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-ext-src-'));
        const dstDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-ext-dst-'));

        await makeExtension(srcDir, 'nested-ext', { 'lib/runtime/config.json': '{"enabled":true}' });
        await makeExtension(dstDir, 'nested-ext', { 'lib/runtime/config.json': '{"enabled":false}' });

        const diff = await fresh.diffPiExtensions(srcDir, dstDir);

        expect(diff.stale).toContain('nested-ext');
        expect(diff.missing).toEqual([]);
        expect(diff.upToDate).toEqual([]);

        await fs.remove(srcDir);
        await fs.remove(dstDir);
    });
});

describe('getInstalledPiPackages', () => {
    it('returns empty array if pi is not installed', () => {
        const packages = getInstalledPiPackages();
        expect(Array.isArray(packages)).toBe(true);
    });

    it('piPreCheck reports only missing Pi packages as needed', async () => {
        vi.resetModules();
        vi.doMock('node:child_process', () => ({
            spawnSync: vi.fn(() => ({
                status: 0,
                stdout: [
                    'User packages:',
                    '  npm:pi-dex',
                    '  npm:pi-gitnexus',
                    'Project packages:',
                    '',
                ].join('\n'),
            })),
        }));

        const { piPreCheck } = await import('../src/utils/pi-extensions.js?t=precheck-' + Date.now());

        const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-ext-src-'));
        const dstDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-ext-dst-'));

        await makeExtension(srcDir, 'managed-ext');
        await makeExtension(dstDir, 'managed-ext');

        const result = await piPreCheck(srcDir, dstDir, ['npm:pi-dex', 'npm:pi-foo']);

        expect(result.extensions.upToDate).toEqual(['managed-ext']);
        expect(result.extensions.missing).toEqual([]);
        expect(result.extensions.stale).toEqual([]);
        expect(result.packages.installed).toEqual(['npm:pi-dex', 'npm:pi-gitnexus']);
        expect(result.packages.needed).toEqual(['npm:pi-foo']);

        await fs.remove(srcDir);
        await fs.remove(dstDir);
        vi.restoreAllMocks();
    });
});
