import fs from 'fs-extra';
import path from 'path';

async function walkUp(startDir: string): Promise<string | null> {
    let dir = path.resolve(startDir);

    while (true) {
        const skillsPath = path.join(dir, 'skills');
        const hooksPath  = path.join(dir, 'hooks');

        if (await fs.pathExists(skillsPath) && await fs.pathExists(hooksPath)) {
            return dir;
        }

        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/**
 * Finds the jaggers-agent-tools repo root by:
 * 1. Walking up from process.cwd() — works when run inside a cloned repo.
 * 2. Walking up from __dirname    — works when run via `npx`, where the
 *    package is extracted to a temp/cache directory that contains skills/ & hooks/.
 */
export async function findRepoRoot(): Promise<string> {
    const fromCwd = await walkUp(process.cwd());
    if (fromCwd) return fromCwd;

    // __dirname is cli/dist/ inside the package — two levels up is the repo root.
    const fromBundle = await walkUp(path.resolve(__dirname, '..', '..'));
    if (fromBundle) return fromBundle;

    throw new Error(
        'Could not locate jaggers-agent-tools repo root.\n' +
        'Run via `npx -y github:Jaggerxtrm/jaggers-agent-tools` or from within the cloned repository.'
    );
}
