import { Command } from 'commander';
import kleur from 'kleur';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { getContext } from '../core/context.js';
import { checkDrift } from '../core/drift.js';
import { t } from '../utils/theme.js';
import { runPiInstall } from './pi-install.js';
import { runClaudeRuntimeSyncPhase } from '../core/claude-runtime-sync.js';
import { confirmDestructiveAction } from '../utils/confirmation.js';
import {
    runMachineBootstrapPhase,
} from '../core/machine-bootstrap.js';

declare const __dirname: string;

interface RegistryFileEntry {
    hash: string;
    version: string;
}

interface RegistryAsset {
    source_dir: string;
    install_mode: 'copy' | 'symlink';
    files: Record<string, RegistryFileEntry>;
}

interface RegistryManifest {
    version: string;
    assets: Record<string, RegistryAsset>;
}

interface InstallStats {
    installed: number;
    upToDate: number;
    driftedSkipped: number;
    forced: number;
}

export interface InstallOpts {
    dryRun?: boolean;
    yes?: boolean;
    force?: boolean;
    prune?: boolean;
    backport?: boolean;
    global?: boolean;
    /** Skip machine bootstrap (beads/dolt/bv/deepwiki) — used by the init orchestrator which handles it in a dedicated phase. */
    skipMachineBootstrap?: boolean;
    /** Skip Claude runtime sync (hooks/settings wiring). */
    skipClaudeRuntimeSync?: boolean;
}

function printNextSteps(): void {
    const d = (s: string) => kleur.dim(s);
    const b = (s: string) => kleur.bold(s);

    console.log(b('  Next steps\n'));

    console.log(d('  In your project:'));
    console.log(`  xtrm init                     ${d('initialize beads + gitnexus for this repo')}`);
    console.log(`  bd prime                      ${d('load session context and available work')}`);
    console.log(`  bv --robot-triage             ${d('graph-aware triage — find highest-impact work')}`);
    console.log(`  bd update <id> --claim        ${d('claim an issue before editing any file')}`);
    console.log(`  bd close <id>                 ${d('close when done')}`);

    console.log('');
    console.log(d('  Worktree workflow:'));
    console.log(`  xt claude                     ${d('launch Claude Code in a sandboxed worktree')}`);
    console.log(`  xt end --dry-run              ${d('preview PR title, body, and linked issues')}`);
    console.log(`  xt end                        ${d('push branch, open PR, clean up worktree')}`);

    console.log('');
    console.log(d('  Reference:'));
    console.log(`  xtrm status                   ${d('check installed vs repo')}`);
    console.log(`  xtrm docs show                ${d('browse all documentation')}`);
    console.log('');
}

async function renderSummaryCard(stats: InstallStats, isDryRun: boolean): Promise<void> {
    const boxen = (await import('boxen')).default;

    const lines = [
        kleur.bold('  ✓ Install complete'),
        '',
        `  ${t.label('Installed')} ${stats.installed}`,
        `  ${t.label('Up-to-date')} ${stats.upToDate}`,
        `  ${t.label('Drift skipped')} ${stats.driftedSkipped}`,
        `  ${t.label('Forced')} ${stats.forced}`,
        ...(isDryRun ? ['', kleur.dim('  Dry run — no changes written')] : []),
    ];

    console.log('\n' + boxen(lines.join('\n'), {
        padding: { top: 1, bottom: 1, left: 1, right: 3 },
        borderStyle: 'round',
        borderColor: 'gray',
    }) + '\n');
}

export { isBeadsInstalled, isDoltInstalled, isDeepwikiInstalled, isBvInstalled } from '../core/machine-bootstrap.js';

export function createInstallAllCommand(): Command {
    return new Command('all')
        .description('[deprecated] Use xtrm install')
        .option('--dry-run', 'Preview changes without making any modifications', false)
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--no-mcp', 'Skip MCP server registration', false)
        .option('--force', 'Overwrite locally drifted files', false)
        .action(async (_opts) => {
            console.log('xtrm install all is deprecated — use: xtrm install');
        });
}

export function createInstallBasicCommand(): Command {
    return new Command('basic')
        .description('[deprecated] Use xtrm install')
        .option('--dry-run', 'Preview changes without making any modifications', false)
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--no-mcp', 'Skip MCP server registration', false)
        .option('--force', 'Overwrite locally drifted files', false)
        .action(async (_opts) => {
            console.log('xtrm install basic is deprecated — use: xtrm install');
        });
}

export async function runMachineBootstrap(opts: { yes?: boolean } = {}): Promise<void> {
    await runMachineBootstrapPhase({ dryRun: false });
}

function resolvePackageRoot(): string {
    const candidates = [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../..'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, '.xtrm', 'registry.json'))) {
            return candidate;
        }
    }

    throw new Error('Failed to locate package root: .xtrm/registry.json not found.');
}

function toPosix(value: string): string {
    return value.split(path.sep).join('/');
}

function stripXtrmPrefix(sourceDir: string): string {
    return sourceDir.replace(/^\.xtrm\/?/, '');
}

function toUserRelativePath(sourceDir: string, filePath: string): string {
    return toPosix(path.posix.join(stripXtrmPrefix(sourceDir), filePath));
}

function isSkillsDefaultPath(relativePath: string): boolean {
    return relativePath.startsWith('skills/default/');
}

async function hashFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

async function scaffoldSkillsDefaultFromPackage(params: {
    packageRoot: string;
    userXtrmDir: string;
    dryRun: boolean;
}): Promise<'symlink' | 'copy' | 'noop'> {
    const { packageRoot, userXtrmDir, dryRun } = params;
    const sourceDir = path.join(packageRoot, '.xtrm', 'skills', 'default');
    const targetDir = path.join(userXtrmDir, 'skills', 'default');

    if (await fs.pathExists(targetDir)) {
        return 'noop';
    }

    if (dryRun) {
        return 'noop';
    }

    await fs.ensureDir(path.dirname(targetDir));

    try {
        await fs.ensureSymlink(sourceDir, targetDir);
        return 'symlink';
    } catch {
        await fs.copy(sourceDir, targetDir);
        return 'copy';
    }
}

function getProjectRoot(): string {
    const gitResult = spawnSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe',
    });
    return gitResult.status === 0 ? (gitResult.stdout ?? '').trim() : process.cwd();
}

function buildExpectedHashes(registry: RegistryManifest): Map<string, string> {
    const expected = new Map<string, string>();

    for (const asset of Object.values(registry.assets)) {
        for (const [filePath, fileEntry] of Object.entries(asset.files)) {
            expected.set(toUserRelativePath(asset.source_dir, filePath), fileEntry.hash);
        }
    }

    return expected;
}

async function installFromRegistry(params: {
    packageRoot: string;
    registry: RegistryManifest;
    userXtrmDir: string;
    dryRun: boolean;
    force: boolean;
    yes: boolean;
}): Promise<InstallStats> {
    const { packageRoot, registry, userXtrmDir, dryRun, force, yes } = params;
    const registryPath = path.join(packageRoot, '.xtrm', 'registry.json');

    const drift = await checkDrift(registryPath, userXtrmDir);
    const expectedHashes = buildExpectedHashes(registry);

    const missingSet = new Set(drift.missing);
    const upToDateSet = new Set(drift.upToDate);
    const driftedSet = new Set(drift.drifted);

    if (!force) {
        const driftedSkills = drift.drifted.filter(isSkillsDefaultPath);
        if (driftedSkills.length > 0) {
            console.log(kleur.yellow('\n  ⚠ Drift detected in .xtrm files (local modifications preserved by default):'));
            for (const relativePath of driftedSkills.slice(0, 10)) {
                const absolutePath = path.join(userXtrmDir, relativePath);
                const actualHash = await hashFile(absolutePath);
                const expectedHash = expectedHashes.get(relativePath) ?? 'unknown';
                console.log(kleur.yellow(`    • ${relativePath}`));
                console.log(kleur.dim(`      expected ${expectedHash.slice(0, 12)}…  actual ${actualHash.slice(0, 12)}…`));
            }
        }

        const nonSkillDrifted = drift.drifted.filter(relativePath => !isSkillsDefaultPath(relativePath));
        if (nonSkillDrifted.length > 0) {
            if (driftedSkills.length === 0) {
                console.log(kleur.yellow('\n  ⚠ Drift detected in .xtrm files (local modifications preserved by default):'));
            }
            for (const relativePath of nonSkillDrifted.slice(0, 20)) {
                const absolutePath = path.join(userXtrmDir, relativePath);
                const actualHash = await hashFile(absolutePath);
                const expectedHash = expectedHashes.get(relativePath) ?? 'unknown';
                console.log(kleur.yellow(`    • ${relativePath}`));
                console.log(kleur.dim(`      expected ${expectedHash.slice(0, 12)}…  actual ${actualHash.slice(0, 12)}…`));
            }
        }

        if (drift.drifted.length > 20) {
            console.log(kleur.dim(`    … and ${drift.drifted.length - 20} more`));
        }
    }

    if (force && drift.drifted.length > 0 && !yes) {
        const confirmed = await confirmDestructiveAction({
            yes,
            message: `Overwrite ${drift.drifted.length} drifted .xtrm file(s)?`,
            initial: true,
        });

        if (!confirmed) {
            console.log(t.muted('  Install cancelled.\n'));
            return {
                installed: 0,
                upToDate: drift.upToDate.length,
                driftedSkipped: drift.drifted.length,
                forced: 0,
            };
        }
    }

    const mode = await scaffoldSkillsDefaultFromPackage({
        packageRoot,
        userXtrmDir,
        dryRun,
    });

    if (mode === 'symlink') {
        console.log(kleur.dim('  ✓ .xtrm/skills/default created as symlink'));
        for (const relativePath of [...missingSet]) {
            if (!isSkillsDefaultPath(relativePath)) continue;
            missingSet.delete(relativePath);
            upToDateSet.add(relativePath);
        }
    } else if (mode === 'copy') {
        console.log(kleur.yellow('  ⚠ Could not create .xtrm/skills/default symlink; used copy fallback'));
        for (const relativePath of [...missingSet]) {
            if (!isSkillsDefaultPath(relativePath)) continue;
            missingSet.delete(relativePath);
            upToDateSet.add(relativePath);
        }
    }

    let installed = 0;
    let forced = 0;

    for (const asset of Object.values(registry.assets)) {
        for (const [filePath] of Object.entries(asset.files)) {
            const relativePath = toUserRelativePath(asset.source_dir, filePath);
            const sourcePath = path.join(packageRoot, asset.source_dir, filePath);
            const targetPath = path.join(userXtrmDir, relativePath);

            if (upToDateSet.has(relativePath)) {
                continue;
            }

            const isMissing = missingSet.has(relativePath);
            const isDrifted = driftedSet.has(relativePath);

            if (!isMissing && !isDrifted) {
                continue;
            }

            if (isDrifted && !force) {
                continue;
            }

            if (isDrifted && force) {
                forced += 1;
            }

            if (dryRun) {
                const action = isDrifted ? 'overwrite' : 'install';
                console.log(kleur.dim(`  [DRY RUN] would ${action} ${relativePath}`));
                installed += 1;
                continue;
            }

            await fs.ensureDir(path.dirname(targetPath));
            await fs.copy(sourcePath, targetPath, { overwrite: true });
            installed += 1;
        }
    }

    return {
        installed,
        upToDate: upToDateSet.size,
        driftedSkipped: force ? 0 : driftedSet.size,
        forced,
    };
}

export async function runInstall(opts: InstallOpts = {}): Promise<void> {
    const {
        dryRun = false,
        yes = false,
        force = false,
        backport = false,
        global: isGlobal = false,
        skipMachineBootstrap = false,
        skipClaudeRuntimeSync = false,
    } = opts;

    if (backport) {
        console.log(kleur.yellow('  ⚠ xtrm install --backport is no longer supported in registry mode.'));
        return;
    }

    const effectiveYes = yes || process.argv.includes('--yes') || process.argv.includes('-y');
    const packageRoot = resolvePackageRoot();
    const projectRoot = getProjectRoot();

    if (!skipMachineBootstrap) {
        await runMachineBootstrap({ yes: effectiveYes });
    }

    const ctx = await getContext({
        createMissingDirs: !dryRun,
        isGlobal,
        projectRoot,
    });
    const userXtrmDir = ctx.targets[0];

    const registryPath = path.join(packageRoot, '.xtrm', 'registry.json');
    const registry = await fs.readJson(registryPath) as RegistryManifest;

    console.log(kleur.bold('\n  ⚙  xtrm install (.xtrm registry scaffold)'));
    console.log(kleur.dim(`  • registry: ${registryPath}`));
    console.log(kleur.dim(`  • target: ${userXtrmDir}`));

    const stats = await installFromRegistry({
        packageRoot,
        registry,
        userXtrmDir,
        dryRun,
        force,
        yes: effectiveYes,
    });

    if (!skipClaudeRuntimeSync) {
        await runClaudeRuntimeSyncPhase({ repoRoot: projectRoot, dryRun, isGlobal });
    }

    await runPiInstall(dryRun, isGlobal, projectRoot);

    await renderSummaryCard(stats, dryRun);

    if (!dryRun) {
        printNextSteps();
    }
}

export function createInstallCommand(): Command {
    const installCmd = new Command('install')
        .description('[deprecated] Use xtrm init — project-scoped setup in one command')
        .option('--dry-run', 'Preview changes without making any modifications', false)
        .option('-y, --yes', 'Skip confirmation prompts', false)
        .option('--prune', 'Remove items not in the canonical repository', false)
        .option('--backport', 'Backport drifted local changes back to the repository', false)
        .option('--force', 'Overwrite locally drifted files', false)
        .option('--global', 'Install to user-global scope (~/.xtrm) instead of project-local', false)
        .action(async (opts) => {
            console.log(kleur.yellow('  ⚠  xtrm install is deprecated — use xtrm init\n'));
            await runInstall(opts);
        });

    installCmd.addCommand(createInstallAllCommand());
    installCmd.addCommand(createInstallBasicCommand());

    return installCmd;
}
