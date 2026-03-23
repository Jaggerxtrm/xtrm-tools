import fs from 'fs-extra';
import path from 'path';
import type { DocEntry } from './docs-scanner.js';

const CACHE_PATH = path.join('.xtrm', 'cache', 'docs-list.json');
const DEFAULT_TTL_MS = 60_000;

export interface DocCache {
    timestamp: number;
    repoRoot: string;
    entries: DocEntry[];
}

export async function readCache(repoRoot: string): Promise<DocCache | null> {
    try {
        const raw = await fs.readFile(path.join(repoRoot, CACHE_PATH), 'utf8');
        const parsed = JSON.parse(raw) as DocCache;
        // Rehydrate lastModified as Date objects
        parsed.entries = parsed.entries.map(e => ({
            ...e,
            lastModified: new Date(e.lastModified),
        }));
        return parsed;
    } catch {
        return null;
    }
}

export async function writeCache(repoRoot: string, entries: DocEntry[]): Promise<void> {
    const cachePath = path.join(repoRoot, CACHE_PATH);
    await fs.ensureDir(path.dirname(cachePath));
    const cache: DocCache = {
        timestamp: Date.now(),
        repoRoot,
        entries,
    };
    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf8');
}

export function isCacheValid(cache: DocCache, entries: DocEntry[], ttlMs: number = DEFAULT_TTL_MS): boolean {
    if (Date.now() - cache.timestamp > ttlMs) return false;
    for (const entry of entries) {
        if (entry.lastModified.getTime() > cache.timestamp) return false;
    }
    return true;
}
