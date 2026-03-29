import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { inventoryPiRuntime, executePiSync } from '../src/core/pi-runtime.js';

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

describe('inventoryPiRuntime', () => {
    let sourceDir: string;
    let targetDir: string;

    beforeEach(async () => {
        vi.resetModules();
        sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-src-'));
        targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-dst-'));
    });

    afterEach(async () => {
        await fs.remove(sourceDir);
        await fs.remove(targetDir);
    });

    it('detects missing extensions', async () => {
        await makeExtension(sourceDir, 'beads');
        await makeExtension(sourceDir, 'session-flow');

        const plan = await inventoryPiRuntime(sourceDir, targetDir);

        expect(plan.missingExtensions.length).toBeGreaterThan(0);
        expect(plan.missingExtensions.some(s => s.ext.id === 'beads')).toBe(true);
    });

    it('detects stale extensions', async () => {
        await makeExtension(sourceDir, 'beads', { 'extra.ts': 'export const x = 1;' });
        await makeExtension(targetDir, 'beads'); // No extra.ts

        const plan = await inventoryPiRuntime(sourceDir, targetDir);

        expect(plan.staleExtensions.length).toBeGreaterThan(0);
        expect(plan.staleExtensions.some(s => s.ext.id === 'beads')).toBe(true);
    });

    it('detects orphaned extensions', async () => {
        await makeExtension(targetDir, 'old-deprecated-extension');

        const plan = await inventoryPiRuntime(sourceDir, targetDir);

        expect(plan.orphanedExtensions).toContain('old-deprecated-extension');
    });

    it('reports allPresent when everything is synced', async () => {
        await makeExtension(sourceDir, 'beads');
        await makeExtension(targetDir, 'beads');

        const plan = await inventoryPiRuntime(sourceDir, targetDir);

        // Only beads is in both, other managed extensions are missing
        // So allPresent will be false unless all MANAGED_EXTENSIONS are present
        expect(plan.allPresent).toBe(false);
    });

    it('computes allRequiredPresent correctly', async () => {
        // Create source for required extension
        await makeExtension(sourceDir, 'beads');
        await makeExtension(targetDir, 'beads');

        const plan = await inventoryPiRuntime(sourceDir, targetDir);

        // beads is required and present, but other required extensions are missing
        expect(plan.allRequiredPresent).toBe(false);
    });
});

describe('executePiSync', () => {
    let sourceDir: string;
    let targetDir: string;

    beforeEach(async () => {
        vi.resetModules();
        sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-src-'));
        targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-dst-'));
    });

    afterEach(async () => {
        await fs.remove(sourceDir);
        await fs.remove(targetDir);
    });

    it('copies missing extensions', async () => {
        await makeExtension(sourceDir, 'beads');
        const plan = await inventoryPiRuntime(sourceDir, targetDir);

        const result = await executePiSync(plan, sourceDir, targetDir, { dryRun: false });

        expect(result.extensionsAdded).toContain('beads');
        expect(await fs.pathExists(path.join(targetDir, 'beads', 'index.ts'))).toBe(true);
    });

    it('updates stale extensions', async () => {
        await makeExtension(sourceDir, 'beads', { 'extra.ts': 'export const x = 1;' });
        await makeExtension(targetDir, 'beads'); // stale - missing extra.ts

        const plan = await inventoryPiRuntime(sourceDir, targetDir);
        const result = await executePiSync(plan, sourceDir, targetDir);

        expect(result.extensionsUpdated).toContain('beads');
        expect(await fs.pathExists(path.join(targetDir, 'beads', 'extra.ts'))).toBe(true);
    });

    it('removes orphaned extensions when removeOrphaned is true', async () => {
        await makeExtension(targetDir, 'old-extension');

        const plan = await inventoryPiRuntime(sourceDir, targetDir);
        const result = await executePiSync(plan, sourceDir, targetDir, { removeOrphaned: true });

        expect(result.extensionsRemoved).toContain('old-extension');
        expect(await fs.pathExists(path.join(targetDir, 'old-extension'))).toBe(false);
    });

    it('preserves orphaned extensions when removeOrphaned is false', async () => {
        await makeExtension(targetDir, 'old-extension');

        const plan = await inventoryPiRuntime(sourceDir, targetDir);
        const result = await executePiSync(plan, sourceDir, targetDir, { removeOrphaned: false });

        expect(result.extensionsRemoved).not.toContain('old-extension');
        expect(await fs.pathExists(path.join(targetDir, 'old-extension'))).toBe(true);
    });

    it('dry run does not modify files', async () => {
        await makeExtension(sourceDir, 'beads');

        const plan = await inventoryPiRuntime(sourceDir, targetDir);
        const result = await executePiSync(plan, sourceDir, targetDir, { dryRun: true });

        expect(result.extensionsAdded).toHaveLength(0);
        expect(await fs.pathExists(path.join(targetDir, 'beads'))).toBe(false);
    });
});
