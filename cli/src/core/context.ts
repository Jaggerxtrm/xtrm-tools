import os from 'os';
import path from 'path';
import fs from 'fs-extra';
// @ts-ignore
import Conf from 'conf';
// @ts-ignore
import prompts from 'prompts';
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
        { label: '.claude', path: path.join(home, '.claude') },
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
    const choices = [];
    const candidates = getCandidatePaths();
    const directTargets = resolveTargets(selector, candidates);

    if (directTargets) {
        const activeConfig = getConfig();
        if (createMissingDirs) {
            for (const target of directTargets) {
                await fs.ensureDir(target);
            }
        }

        return {
            targets: directTargets,
            syncMode: activeConfig.get('syncMode') as SyncMode,
            config: activeConfig,
        };
    }

    const activeConfig = getConfig();

    for (const c of candidates) {
        const exists = await fs.pathExists(c.path);
        const icon = exists ? kleur.green('●') : kleur.gray('○');
        const desc = exists ? 'Found' : 'Not found (will create)';

        choices.push({
            title: `${icon} ${c.label} (${c.path})`,
            description: desc,
            value: c.path,
            selected: exists, // Pre-select existing environments
        });
    }

    const response = await prompts({
        type: 'multiselect',
        name: 'targets',
        message: 'Select target environment(s):',
        choices: choices,
        hint: '- Space to select. Return to submit',
        instructions: false,
    });

    if (response.targets === undefined) {
        console.log(kleur.gray('\nCancelled.'));
        process.exit(130);
    }
    if (response.targets.length === 0) {
        console.log(kleur.gray('No targets selected.'));
        process.exit(0);
    }

    // Ensure directories exist for selected targets
    if (createMissingDirs) {
        for (const target of response.targets) {
            await fs.ensureDir(target);
        }
    }

    return {
        targets: response.targets,
        syncMode: activeConfig.get('syncMode') as SyncMode,
        config: activeConfig,
    };

}

export function resetContext(): void {
    getConfig().clear();
    console.log(kleur.yellow('Configuration cleared.'));
}
