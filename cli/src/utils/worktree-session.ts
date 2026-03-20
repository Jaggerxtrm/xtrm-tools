import kleur from 'kleur';
import path from 'node:path';
import fs from 'fs-extra';
import { execSync, spawnSync } from 'node:child_process';
import { findRepoRoot } from './repo-root.js';

export interface WorktreeSessionOptions {
    runtime: 'claude' | 'pi';
    name?: string;
}

function randomSlug(len: number = 4): string {
    return Math.random().toString(36).slice(2, 2 + len);
}

function shortDate(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Launch a Claude or Pi session in a sandboxed git worktree.
 *
 * Worktree path: sibling to CWD, named <cwd-basename>-xt-<runtime>-<shortdate>
 * Branch: xt/<name> if name provided, xt/<4-char-random> otherwise
 * Dolt bootstrap: redirect worktree to main's canonical beads db
 */
export async function launchWorktreeSession(opts: WorktreeSessionOptions): Promise<void> {
    const { runtime, name } = opts;
    const cwd = process.cwd();
    const repoRoot = await findRepoRoot();
    const cwdBasename = path.basename(cwd);

    // Resolve worktree path (sibling to cwd)
    const date = shortDate();
    const worktreeName = `${cwdBasename}-xt-${runtime}-${date}`;
    const worktreePath = path.join(path.dirname(cwd), worktreeName);

    // Resolve branch name
    const branchName = `xt/${name ?? randomSlug(4)}`;

    console.log(kleur.bold(`\n  Launching ${runtime} session`));
    console.log(kleur.dim(`  worktree: ${worktreePath}`));
    console.log(kleur.dim(`  branch:   ${branchName}\n`));

    // Create worktree (create branch if it doesn't exist)
    const branchExists = spawnSync('git', ['rev-parse', '--verify', branchName], {
        cwd: repoRoot, stdio: 'pipe',
    }).status === 0;

    const worktreeArgs = branchExists
        ? ['worktree', 'add', worktreePath, branchName]
        : ['worktree', 'add', '-b', branchName, worktreePath];

    const worktreeResult = spawnSync('git', worktreeArgs, { cwd: repoRoot, stdio: 'inherit' });
    if (worktreeResult.status !== 0) {
        console.error(kleur.red(`\n  ✗ Failed to create worktree at ${worktreePath}\n`));
        process.exit(1);
    }

    // Dolt bootstrap: redirect worktree to main's canonical beads db
    const mainBeadsDir = path.join(repoRoot, '.beads');
    const worktreeBeadsDir = path.join(worktreePath, '.beads');
    const mainPortFile = path.join(mainBeadsDir, 'dolt-server.port');

    if (await fs.pathExists(mainBeadsDir)) {
        const worktreePortFile = path.join(worktreeBeadsDir, 'dolt-server.port');

        // Stop the auto-spawned isolated dolt server in the worktree (best-effort)
        spawnSync('bd', ['dolt', 'stop'], { cwd: worktreePath, stdio: 'pipe' });

        // Resolve main's Dolt port: prefer port file, fall back to bd dolt status
        let mainPort: string | null = null;
        if (await fs.pathExists(mainPortFile)) {
            mainPort = (await fs.readFile(mainPortFile, 'utf8')).trim();
        } else {
            // Query live server port from main checkout
            const statusResult = spawnSync('bd', ['dolt', 'status'], {
                cwd: repoRoot, stdio: 'pipe', encoding: 'utf8',
            });
            const portMatch = (statusResult.stdout ?? '').match(/Port:\s*(\d+)/);
            if (portMatch) {
                mainPort = portMatch[1];
                // Persist to port file so future worktrees find it immediately
                await fs.writeFile(mainPortFile, mainPort, 'utf8');
            }
        }

        if (mainPort) {
            await fs.ensureDir(worktreeBeadsDir);
            await fs.writeFile(worktreePortFile, mainPort, 'utf8');
            console.log(kleur.dim(`  beads: redirected to main server (port ${mainPort})`));
        } else {
            console.log(kleur.dim('  beads: main Dolt server not running, worktree will use isolated db'));
        }
    }

    console.log(kleur.green(`\n  ✓ Worktree ready — launching ${runtime}...\n`));

    // Launch the runtime in the worktree
    const runtimeCmd = runtime === 'claude' ? 'claude' : 'pi';
    const launchResult = spawnSync(runtimeCmd, [], {
        cwd: worktreePath,
        stdio: 'inherit',
    });

    process.exit(launchResult.status ?? 0);
}
