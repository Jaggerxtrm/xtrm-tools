/**
 * Pi extension utilities — backward compatibility module.
 *
 * This module provides legacy function signatures that delegate to
 * the unified pi-runtime service. New code should use pi-runtime.ts directly.
 *
 * @deprecated Use cli/src/core/pi-runtime.ts for new implementations.
 */

import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'node:child_process';

export interface SyncPiExtensionsOptions {
    sourceDir: string;
    targetDir: string;
    dryRun?: boolean;
    log?: (message: string) => void;
}

export interface PiExtensionDiff {
    missing: string[];
    stale: string[];
    upToDate: string[];
}

export interface PiPreCheckResult {
    extensions: PiExtensionDiff;
    packages: {
        installed: string[];
        needed: string[];
    };
}

// ── Hash Utilities (used by pi-runtime.ts) ────────────────────────────────────

async function listFilesRecursive(baseDir: string, currentDir: string = baseDir): Promise<string[]> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFilesRecursive(baseDir, fullPath));
            continue;
        }
        if (entry.isFile()) {
            files.push(path.relative(baseDir, fullPath));
        }
    }

    return files.sort();
}

/**
 * Compute a hash for an extension package based on all tracked files.
 * This catches drift in nested files, not just package.json/index.ts.
 */
export async function extensionHash(extDir: string): Promise<string> {
    if (!await fs.pathExists(extDir)) return '';

    const crypto = await import('node:crypto');
    const files = await listFilesRecursive(extDir);
    const hash = crypto.createHash('sha256');

    for (const relativeFile of files) {
        const absoluteFile = path.join(extDir, relativeFile);
        hash.update(relativeFile);
        hash.update('\0');
        hash.update(await fs.readFile(absoluteFile));
        hash.update('\0');
    }

    return hash.digest('hex');
}

// ── Legacy Functions (backward compat) ────────────────────────────────────────

/**
 * List extension directories (contain package.json) in a base directory.
 * @deprecated Use inventoryPiRuntime from pi-runtime.ts
 */
export async function listExtensionDirs(baseDir: string): Promise<string[]> {
    if (!await fs.pathExists(baseDir)) return [];
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const extDirs: string[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const extPath = path.join(baseDir, entry.name);
        const pkgPath = path.join(extPath, 'package.json');
        if (await fs.pathExists(pkgPath)) {
            extDirs.push(entry.name);
        }
    }
    return extDirs.sort();
}

/**
 * Parse `pi list` output to get installed package names.
 * @deprecated Use inventoryPiRuntime from pi-runtime.ts
 */
export function getInstalledPiPackages(): string[] {
    const result = spawnSync('pi', ['list'], { encoding: 'utf8', stdio: 'pipe' });
    if (result.status !== 0) return [];

    const output = result.stdout;
    const packages: string[] = [];

    let inUserPackages = false;
    for (const line of output.split('\n')) {
        if (line.includes('User packages:')) {
            inUserPackages = true;
            continue;
        }
        if (line.includes('Project packages:')) {
            inUserPackages = false;
            continue;
        }
        if (inUserPackages) {
            const match = line.match(/^\s+(npm:[\w\-/@]+)/);
            if (match) packages.push(match[1]);
        }
    }

    return packages.sort();
}

/**
 * Compare extension packages between source and target directories.
 * @deprecated Use inventoryPiRuntime from pi-runtime.ts
 */
export async function diffPiExtensions(sourceDir: string, targetDir: string): Promise<PiExtensionDiff> {
    const sourceAbs = path.resolve(sourceDir);
    const targetAbs = path.resolve(targetDir);

    const sourceExts = await listExtensionDirs(sourceAbs);
    const missing: string[] = [];
    const stale: string[] = [];
    const upToDate: string[] = [];

    for (const extName of sourceExts) {
        const srcExtPath = path.join(sourceAbs, extName);
        const dstExtPath = path.join(targetAbs, extName);

        if (!await fs.pathExists(dstExtPath)) {
            missing.push(extName);
            continue;
        }

        const dstPkgPath = path.join(dstExtPath, 'package.json');
        if (!await fs.pathExists(dstPkgPath)) {
            missing.push(extName);
            continue;
        }

        const [srcHash, dstHash] = await Promise.all([
            extensionHash(srcExtPath),
            extensionHash(dstExtPath)
        ]);

        if (srcHash !== dstHash) {
            stale.push(extName);
        } else {
            upToDate.push(extName);
        }
    }

    return { missing, stale, upToDate };
}

/**
 * Run pre-check for both extensions and packages.
 * @deprecated Use inventoryPiRuntime from pi-runtime.ts
 */
export async function piPreCheck(
    sourceExtDir: string,
    targetExtDir: string,
    requiredPackages: string[]
): Promise<PiPreCheckResult> {
    const extensions = await diffPiExtensions(sourceExtDir, targetExtDir);
    const installedPkgs = getInstalledPiPackages();
    const needed = requiredPackages.filter(pkg => !installedPkgs.includes(pkg));

    return {
        extensions,
        packages: {
            installed: installedPkgs,
            needed,
        },
    };
}

/**
 * Sync managed extension packages into target directory.
 * Only copies missing and stale extensions, skips up-to-date.
 *
 * NOTE: This function does NOT remove orphaned extensions.
 * For mirror sync behavior, use executePiSync from pi-runtime.ts.
 *
 * @deprecated Use executePiSync from pi-runtime.ts
 */
export async function syncManagedPiExtensions({
    sourceDir,
    targetDir,
    dryRun = false,
    log,
}: SyncPiExtensionsOptions): Promise<number> {
    if (!await fs.pathExists(sourceDir)) {
        throw new Error(
            `Pi extensions source directory not found: ${sourceDir}\n` +
            `Ensure xtrm-tools is installed correctly (not xtrm-cli).`
        );
    }

    const diff = await diffPiExtensions(sourceDir, targetDir);
    const toSync = [...diff.missing, ...diff.stale];

    if (toSync.length === 0) {
        if (log) log(`✓ All ${diff.upToDate.length} extensions up-to-date, skipping sync`);
        return diff.upToDate.length;
    }

    if (!dryRun) {
        await fs.ensureDir(targetDir);

        for (const extName of toSync) {
            const srcPath = path.join(sourceDir, extName);
            const dstPath = path.join(targetDir, extName);
            await fs.copy(srcPath, dstPath, { overwrite: true });
            if (log) {
                log(`${diff.missing.includes(extName) ? '+' : '↻'} ${extName}`);
            }
        }
    } else {
        if (log) log(`[DRY RUN] would sync ${toSync.length} extensions: ${toSync.join(', ')}`);
    }

    if (log) {
        const action = dryRun ? 'would sync' : 'synced';
        log(`${action} ${toSync.length} extension(s), skipped ${diff.upToDate.length} up-to-date`);
    }

    return diff.upToDate.length + toSync.length;
}

// Re-export for pi-runtime.ts
export { listFilesRecursive };
