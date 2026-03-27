import kleur from 'kleur';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';

export interface WorktreeSessionOptions {
    runtime: 'claude' | 'pi';
    name?: string;
}

function randomSlug(len: number = 4): string {
    return Math.random().toString(36).slice(2, 2 + len);
}

function gitRepoRoot(cwd: string): string | null {
    const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
        cwd, stdio: 'pipe', encoding: 'utf8',
    });
    return r.status === 0 ? (r.stdout ?? '').trim() : null;
}

/**
 * Launch a Claude or Pi session in a sandboxed git worktree.
 *
 * Worktree path: inside repo under .xtrm/worktrees/, named <cwd-basename>-xt-<runtime>-<slug>
 * Branch: xt/<name> if name provided, xt/<4-char-random> otherwise
 * Beads: bd worktree create sets up canonical .beads/redirect to share the main db
 */

/**
 * Resolve the statusline.mjs path: prefer the plugin cache (stays in sync with
 * plugin version), fall back to ~/.claude/hooks/statusline.mjs.
 */
function resolveStatuslineScript(): string | null {
    const pluginsFile = path.join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
    try {
        const plugins = JSON.parse(readFileSync(pluginsFile, 'utf8'));
        for (const [key, entries] of Object.entries(plugins?.plugins ?? {}) as [string, any[]][]) {
            if (!key.startsWith('xtrm-tools@') || !entries?.length) continue;
            const p = path.join(entries[0].installPath, 'hooks', 'statusline.mjs');
            if (existsSync(p)) return p;
        }
    } catch { /* fall through */ }
    // Fallback: ~/.claude/hooks/statusline.mjs
    const fallback = path.join(homedir(), '.claude', 'hooks', 'statusline.mjs');
    return existsSync(fallback) ? fallback : null;
}

export interface SessionMeta {
    runtime: 'claude' | 'pi';
    launchedAt: string;
}

// Write to .xtrm/ (gitignored) to prevent the file from ever being committed.
function sessionMetaPath(worktreePath: string): string {
    return path.join(worktreePath, '.xtrm', 'session-meta.json');
}

export function writeSessionMeta(worktreePath: string, runtime: 'claude' | 'pi'): void {
    try {
        const meta: SessionMeta = { runtime, launchedAt: new Date().toISOString() };
        const dest = sessionMetaPath(worktreePath);
        mkdirSync(path.dirname(dest), { recursive: true });
        writeFileSync(dest, JSON.stringify(meta, null, 2));
    } catch { /* non-fatal */ }
}

export function readSessionMeta(worktreePath: string): SessionMeta | null {
    try {
        // Try new location first (.xtrm/session-meta.json), fall back to old root location.
        const newPath = sessionMetaPath(worktreePath);
        const oldPath = path.join(worktreePath, '.session-meta.json');
        const filePath = existsSync(newPath) ? newPath : oldPath;
        const raw = readFileSync(filePath, 'utf8');
        return JSON.parse(raw) as SessionMeta;
    } catch {
        return null;
    }
}

export async function launchWorktreeSession(opts: WorktreeSessionOptions): Promise<void> {
    const { runtime, name } = opts;
    const cwd = process.cwd();

    // Use git to find the user's actual repo root — not xtrm-tools' package root
    const repoRoot = gitRepoRoot(cwd);
    if (!repoRoot) {
        console.error(kleur.red('\n  ✗ Not inside a git repository\n'));
        process.exit(1);
    }

    const cwdBasename = path.basename(repoRoot);

    // Resolve slug — shared by both branch and worktree path so they're linked
    const slug = name ?? randomSlug(4);

    // Worktree path: inside repo under .xtrm/worktrees/
    const worktreeName = `${cwdBasename}-xt-${runtime}-${slug}`;
    const worktreePath = path.join(repoRoot, '.xtrm', 'worktrees', worktreeName);

    // Branch name
    const branchName = `xt/${slug}`;

    console.log(kleur.bold(`\n  Launching ${runtime} session`));
    console.log(kleur.dim(`  worktree: ${worktreePath}`));
    console.log(kleur.dim(`  branch:   ${branchName}\n`));

    // Use bd worktree create — sets up git worktree + canonical .beads/redirect in one step.
    // Falls back to plain git worktree add if bd is unavailable or the project has no .beads/.
    const bdResult = spawnSync('bd', ['worktree', 'create', worktreePath, '--branch', branchName], {
        cwd: repoRoot, stdio: 'inherit',
    });

    if (bdResult.error || bdResult.status !== 0) {
        // Fall back to plain git worktree add (bd not found or no .beads/ in project)
        if (bdResult.status !== 0 && !bdResult.error) {
            console.log(kleur.dim('  beads: no database found, creating worktree without redirect'));
        }
        const branchExists = spawnSync('git', ['rev-parse', '--verify', branchName], {
            cwd: repoRoot, stdio: 'pipe',
        }).status === 0;

        const gitArgs = branchExists
            ? ['worktree', 'add', worktreePath, branchName]
            : ['worktree', 'add', '-b', branchName, worktreePath];

        const gitResult = spawnSync('git', gitArgs, { cwd: repoRoot, stdio: 'inherit' });
        if (gitResult.status !== 0) {
            console.error(kleur.red(`\n  ✗ Failed to create worktree at ${worktreePath}\n`));
            process.exit(1);
        }
    }

    writeSessionMeta(worktreePath, runtime);
    console.log(kleur.green(`\n  ✓ Worktree ready — launching ${runtime}...\n`));

    // Pi worktree: symlink .pi -> project root .pi so Pi finds project-scoped settings + extensions.
    // Pi reads config from <cwd>/.pi/ only (no walk-up), so without this worktrees would fall
    // back to the global ~/.pi/agent/settings.json which has no local extension paths.
    if (runtime === 'pi') {
        const projectPiDir = path.join(repoRoot, '.pi');
        const worktreePiLink = path.join(worktreePath, '.pi');
        if (existsSync(projectPiDir) && !existsSync(worktreePiLink)) {
            try { symlinkSync(projectPiDir, worktreePiLink); } catch { /* non-fatal */ }
        }
    }

    // Inject statusLine config for claude worktree sessions
    if (runtime === 'claude') {
        const statuslinePath = resolveStatuslineScript();
        if (statuslinePath) {
            const claudeDir = path.join(worktreePath, '.claude');
            const localSettingsPath = path.join(claudeDir, 'settings.local.json');
            try {
                mkdirSync(claudeDir, { recursive: true });
                writeFileSync(localSettingsPath, JSON.stringify({
                    statusLine: { type: 'command', command: `node ${statuslinePath}`, padding: 1 },
                }, null, 2));
            } catch { /* non-fatal — statusline is cosmetic */ }
        }
    }

    // Launch the runtime in the worktree
    const runtimeCmd = runtime === 'claude' ? 'claude' : 'pi';
    const runtimeArgs = runtime === 'claude' ? ['--dangerously-skip-permissions'] : [];
    const launchResult = spawnSync(runtimeCmd, runtimeArgs, {
        cwd: worktreePath,
        stdio: 'inherit',
    });

    process.exit(launchResult.status ?? 0);
}
