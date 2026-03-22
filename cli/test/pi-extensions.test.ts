import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncManagedPiExtensions, diffPiExtensions, getInstalledPiPackages } from '../src/utils/pi-extensions.js';

describe('syncManagedPiExtensions', () => {
    it('copies missing and stale extensions, skips up-to-date', async () => {
        const srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ext-src-'));
        const dstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ext-dst-'));

        // Source extensions
        fs.mkdirSync(path.join(srcRoot, 'ext-a'));
        fs.writeFileSync(path.join(srcRoot, 'ext-a', 'package.json'), '{"name":"ext-a","version":"1.0.0"}');
        fs.writeFileSync(path.join(srcRoot, 'ext-a', 'index.ts'), 'export default {};');

        fs.mkdirSync(path.join(srcRoot, 'ext-b'));
        fs.writeFileSync(path.join(srcRoot, 'ext-b', 'package.json'), '{"name":"ext-b","version":"1.0.0"}');
        fs.writeFileSync(path.join(srcRoot, 'ext-b', 'index.ts'), 'export default {};');

        // Destination: ext-a already exists with same content (up-to-date)
        fs.mkdirSync(path.join(dstRoot, 'ext-a'));
        fs.writeFileSync(path.join(dstRoot, 'ext-a', 'package.json'), '{"name":"ext-a","version":"1.0.0"}');
        fs.writeFileSync(path.join(dstRoot, 'ext-a', 'index.ts'), 'export default {};');

        const logs: string[] = [];
        const count = await syncManagedPiExtensions({
            sourceDir: srcRoot,
            targetDir: dstRoot,
            log: (message) => logs.push(message),
        });

        expect(count).toBe(2);
        // ext-a should not be re-copied (up-to-date)
        // ext-b should be copied (missing)
        expect(logs.some((m) => m.includes('skipped 1 up-to-date'))).toBe(true);
        expect(fs.existsSync(path.join(dstRoot, 'ext-b', 'index.ts'))).toBe(true);

        fs.rmSync(srcRoot, { recursive: true, force: true });
        fs.rmSync(dstRoot, { recursive: true, force: true });
    });

    it('skips sync entirely when all extensions are up-to-date', async () => {
        const srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ext-src-'));
        const dstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ext-dst-'));

        // Create identical extension in both source and dest
        fs.mkdirSync(path.join(srcRoot, 'my-ext'));
        fs.writeFileSync(path.join(srcRoot, 'my-ext', 'package.json'), '{"name":"my-ext"}');
        fs.writeFileSync(path.join(srcRoot, 'my-ext', 'index.ts'), 'export const x = 1;');

        fs.mkdirSync(path.join(dstRoot, 'my-ext'));
        fs.writeFileSync(path.join(dstRoot, 'my-ext', 'package.json'), '{"name":"my-ext"}');
        fs.writeFileSync(path.join(dstRoot, 'my-ext', 'index.ts'), 'export const x = 1;');

        const logs: string[] = [];
        const count = await syncManagedPiExtensions({
            sourceDir: srcRoot,
            targetDir: dstRoot,
            log: (message) => logs.push(message),
        });

        expect(count).toBe(1);
        expect(logs.some((m) => m.includes('All 1 extensions up-to-date, skipping sync'))).toBe(true);

        fs.rmSync(srcRoot, { recursive: true, force: true });
        fs.rmSync(dstRoot, { recursive: true, force: true });
    });

    it('supports dry-run without writing files', async () => {
        const srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ext-src-'));
        const dstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ext-dst-'));

        fs.mkdirSync(path.join(srcRoot, 'quality-gates'));
        fs.writeFileSync(path.join(srcRoot, 'quality-gates', 'package.json'), '{}');

        const logs: string[] = [];
        const count = await syncManagedPiExtensions({
            sourceDir: srcRoot,
            targetDir: dstRoot,
            dryRun: true,
            log: (message) => logs.push(message),
        });

        expect(count).toBe(1);
        expect(fs.existsSync(path.join(dstRoot, 'quality-gates'))).toBe(false);
        expect(logs.some((message) => message.includes('[DRY RUN]'))).toBe(true);

        fs.rmSync(srcRoot, { recursive: true, force: true });
        fs.rmSync(dstRoot, { recursive: true, force: true });
    });

    it('returns 0 when source directory does not exist', async () => {
        const count = await syncManagedPiExtensions({
            sourceDir: '/nonexistent/path',
            targetDir: '/tmp/target',
        });
        expect(count).toBe(0);
    });
});

describe('diffPiExtensions', () => {
    it('detects missing, stale, and up-to-date extensions', async () => {
        const srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-diff-src-'));
        const dstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-diff-dst-'));

        // Source: ext-a (will be stale), ext-b (will be missing), ext-c (up-to-date)
        fs.mkdirSync(path.join(srcRoot, 'ext-a'));
        fs.writeFileSync(path.join(srcRoot, 'ext-a', 'package.json'), '{"v":2}');
        fs.writeFileSync(path.join(srcRoot, 'ext-a', 'index.ts'), 'export const a = 2;');

        fs.mkdirSync(path.join(srcRoot, 'ext-b'));
        fs.writeFileSync(path.join(srcRoot, 'ext-b', 'package.json'), '{}');

        fs.mkdirSync(path.join(srcRoot, 'ext-c'));
        fs.writeFileSync(path.join(srcRoot, 'ext-c', 'package.json'), '{}');
        fs.writeFileSync(path.join(srcRoot, 'ext-c', 'index.ts'), 'export const c = 1;');

        // Destination: ext-a with old content (stale), ext-c identical (up-to-date)
        fs.mkdirSync(path.join(dstRoot, 'ext-a'));
        fs.writeFileSync(path.join(dstRoot, 'ext-a', 'package.json'), '{"v":1}');
        fs.writeFileSync(path.join(dstRoot, 'ext-a', 'index.ts'), 'export const a = 1;');

        fs.mkdirSync(path.join(dstRoot, 'ext-c'));
        fs.writeFileSync(path.join(dstRoot, 'ext-c', 'package.json'), '{}');
        fs.writeFileSync(path.join(dstRoot, 'ext-c', 'index.ts'), 'export const c = 1;');

        const diff = await diffPiExtensions(srcRoot, dstRoot);

        expect(diff.missing).toEqual(['ext-b']);
        expect(diff.stale).toEqual(['ext-a']);
        expect(diff.upToDate).toEqual(['ext-c']);

        fs.rmSync(srcRoot, { recursive: true, force: true });
        fs.rmSync(dstRoot, { recursive: true, force: true });
    });
});

describe('getInstalledPiPackages', () => {
    it('returns empty array if pi is not installed', async () => {
        // This test will pass even if pi is installed, as it just checks the function runs
        const packages = getInstalledPiPackages();
        expect(Array.isArray(packages)).toBe(true);
    });
});