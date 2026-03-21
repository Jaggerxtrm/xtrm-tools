import fs from 'fs-extra';
import path from 'path';

export interface SyncPiExtensionsOptions {
    sourceDir: string;
    targetDir: string;
    dryRun?: boolean;
    log?: (message: string) => void;
}

/**
 * Sync managed extension packages into ~/.pi/agent/extensions.
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
    if (!await fs.pathExists(sourceDir)) return 0;

    if (!dryRun) {
        await fs.ensureDir(path.dirname(targetDir));
        await fs.copy(sourceDir, targetDir, { overwrite: true });
    }

    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    const managedPackages = entries.filter((entry) => entry.isDirectory()).length;

    if (log) {
        if (dryRun) {
            log(`  [DRY RUN] sync extensions ${sourceDir} -> ${targetDir}`);
        }
        log(`  Pi will auto-discover ${managedPackages} extension package(s) from ${targetDir}`);
    }

    return managedPackages;
}
