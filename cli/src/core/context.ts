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
    createMissingDirs?: boolean;
    isGlobal?: boolean;
    projectRoot?: string;
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

/**
 * Returns skill sync targets.
 * Claude is handled entirely by the plugin — no file-sync target needed.
 * Only returns the skills target (.agents/skills project-local or ~/.agents/skills global).
 */
export function getCandidatePaths(isGlobal: boolean = false, projectRoot?: string): Array<{ label: string; path: string }> {
    const home = os.homedir();
    const skillsPath = isGlobal || !projectRoot
        ? path.join(home, '.agents', 'skills')
        : path.join(projectRoot, '.agents', 'skills');
    const skillsLabel = isGlobal ? '~/.agents/skills' : '.agents/skills';

    return [{ label: skillsLabel, path: skillsPath }];
}

export async function getContext(options: GetContextOptions = {}): Promise<Context> {
    const { createMissingDirs = true, isGlobal = false, projectRoot } = options;
    const candidates = getCandidatePaths(isGlobal, projectRoot);
    const activeConfig = getConfig();
    const selectedPaths = candidates.map(c => c.path);

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
