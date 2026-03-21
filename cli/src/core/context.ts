import os from 'os';
import path from 'path';
import fs from 'fs-extra';
// @ts-ignore
import Conf from 'conf';
import kleur from 'kleur';
import type { SyncMode } from '../types/config.js';


export interface Context {
    targets: string[];
    syncMode: 'copy' | 'symlink' | 'prune';
    config: any;
}

export interface GetContextOptions {
    selector?: string;
    createMissingDirs?: boolean;
}

let config: Conf | null = null;

function getConfig(): Conf {
    if (!config) {
        config = new Conf({
            projectName: 'xtrm-cli',
            defaults: {
                syncMode: 'copy',
            },
        });
    }

    return config;
}

export function getCandidatePaths(): Array<{ label: string; path: string }> {
    const home = os.homedir();
    const appData = process.env.APPDATA;
    const isWindows = process.platform === 'win32';

    const paths = [
        { label: '~/.claude (hooks + skills)', path: path.join(home, '.claude') },
        { label: '~/.agents/skills', path: path.join(home, '.agents', 'skills') },
    ];

    if (isWindows && appData) {
        paths.push({ label: 'Claude (AppData)', path: path.join(appData, 'Claude') });
    }

    return paths;
}

export function resolveTargets(
    selector: string | undefined,
    candidates: Array<{ label: string; path: string }>,
): string[] | null {
    if (!selector) return null;

    const normalized = selector.trim().toLowerCase();
    if (normalized === '*' || normalized === 'all') {
        return candidates.map(candidate => candidate.path);
    }

    throw new Error(`Unknown install target selector '${selector}'. Use '*' or 'all'.`);
}

export async function getContext(options: GetContextOptions = {}): Promise<Context> {
    const { selector, createMissingDirs = true } = options;
    const candidates = getCandidatePaths();
    const directTargets = resolveTargets(selector, candidates);

    const activeConfig = getConfig();

    // Use explicitly specified targets, or default to all candidates
    const selectedPaths = directTargets ?? candidates.map(c => c.path);

    if (createMissingDirs) {
        for (const target of selectedPaths) {
            await fs.ensureDir(target);
        }
    }

    return {
        targets: selectedPaths,
        syncMode: activeConfig.get('syncMode') as SyncMode,
        config: activeConfig,
    };

}
export function resetContext(): void {
    getConfig().clear();
    console.log(kleur.yellow('Configuration cleared.'));
}
