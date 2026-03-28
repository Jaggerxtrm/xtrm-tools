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

/**
 * List extension directories (contain package.json) in a base directory.
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

async function fileSha256(filePath: string): Promise<string> {
    const crypto = await import('node:crypto');
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Compute a hash for an extension package based on package.json + index.ts.
 */
export async function extensionHash(extDir: string): Promise<string> {
    const pkgPath = path.join(extDir, 'package.json');
    const indexPath = path.join(extDir, 'index.ts');

    const hashes: string[] = [];

    if (await fs.pathExists(pkgPath)) {
        hashes.push(await fileSha256(pkgPath));
    }
    if (await fs.pathExists(indexPath)) {
        hashes.push(await fileSha256(indexPath));
    }

    return hashes.join(':');
}

/**
 * Compare extension packages between source and target directories.
 * Returns missing, stale, and up-to-date extension names.
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

        // Check if extension exists in target
        if (!await fs.pathExists(dstExtPath)) {
            missing.push(extName);
            continue;
        }

        // Check if package.json exists in target
        const dstPkgPath = path.join(dstExtPath, 'package.json');
        if (!await fs.pathExists(dstPkgPath)) {
            missing.push(extName);
            continue;
        }

        // Compare hashes
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
 * Parse `pi list` output to get installed package names.
 * Returns array of package names (e.g., ['npm:pi-dex', 'npm:pi-gitnexus'])
 */
export function getInstalledPiPackages(): string[] {
    const result = spawnSync('pi', ['list'], { encoding: 'utf8', stdio: 'pipe' });
    if (result.status !== 0) return [];

    const output = result.stdout;
    const packages: string[] = [];

    // Parse lines like "  npm:pi-dex" under "User packages:"
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
            if (match) {
                packages.push(match[1]);
            }
        }
    }

    return packages.sort();
}

/**
 * Run pre-check for both extensions and packages.
 * Returns diff for extensions and lists for packages.
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
 * Sync managed extension packages into ~/.pi/agent/extensions.
 * Only copies missing and stale extensions, skips up-to-date.
 *
 * Pi auto-discovers extensions from this directory, so we intentionally do not
 * run `pi install -l` for these managed packages (prevents double registration).
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
        if (log) {
            log(`  ✓ All ${diff.upToDate.length} extensions up-to-date, skipping sync`);
        }
        return diff.upToDate.length;
    }

    if (!dryRun) {
        await fs.ensureDir(targetDir);

        for (const extName of toSync) {
            const srcPath = path.join(sourceDir, extName);
            const dstPath = path.join(targetDir, extName);
            await fs.copy(srcPath, dstPath, { overwrite: true });
            if (log) {
                log(`  ${diff.missing.includes(extName) ? '+' : '↻'} ${extName}`);
            }
        }
    } else {
        if (log) {
            log(`  [DRY RUN] would sync ${toSync.length} extensions: ${toSync.join(', ')}`);
        }
    }

    if (log) {
        const action = dryRun ? 'would sync' : 'synced';
        log(`  ${action} ${toSync.length} extension(s), skipped ${diff.upToDate.length} up-to-date`);
    }

    return diff.upToDate.length + toSync.length;
}