import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncManagedPiExtensions } from '../src/utils/pi-extensions.js';

describe('syncManagedPiExtensions', () => {
    it('copies extension packages and reports package count', async () => {
        const srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ext-src-'));
        const dstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ext-dst-'));

        fs.mkdirSync(path.join(srcRoot, 'plan-mode'));
        fs.writeFileSync(path.join(srcRoot, 'plan-mode', 'package.json'), '{}');
        fs.writeFileSync(path.join(srcRoot, 'plan-mode', 'index.ts'), 'export default {};');
        fs.mkdirSync(path.join(srcRoot, 'beads'));
        fs.writeFileSync(path.join(srcRoot, 'beads', 'package.json'), '{}');

        const count = await syncManagedPiExtensions({
            sourceDir: srcRoot,
            targetDir: dstRoot,
        });

        expect(count).toBe(2);
        expect(fs.existsSync(path.join(dstRoot, 'plan-mode', 'index.ts'))).toBe(true);

        fs.rmSync(srcRoot, { recursive: true, force: true });
        fs.rmSync(dstRoot, { recursive: true, force: true });
    });

    it('supports dry-run without writing files', async () => {
        const srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ext-src-'));
        const dstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ext-dst-'));
        fs.mkdirSync(path.join(srcRoot, 'quality-gates'));

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
});
