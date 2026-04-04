/**
 * Unified Pi runtime service: extensions + packages + config.
 *
 * Models all Pi-related installation in a single registry.
 * Provides inventory -> plan -> sync/repair -> verify lifecycle.
 *
 * Unifies the previously split flows:
 * - pi-install.ts (runPiInstall) — non-interactive sync
 * - install-pi.ts (createInstallPiCommand) — interactive setup
 *
 * Solves xtrm-920d: mirror sync removes stale extensions from target.
 */

import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import kleur from 'kleur';
import path from 'path';
import { homedir } from 'node:os';
import { t, sym } from '../utils/theme.js';
import { resolveSkillsRoot } from './skills-layout.js';
import { validateSkillsInvariants } from './skill-discovery.js';
import { rebuildRuntimeActiveView } from './skills-materializer.js';

// Resolve xtrm-tools package root from __dirname (cli/dist/ -> ../..)
declare const __dirname: string;

function resolvePkgRoot(): string {
    const candidates = [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../..'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, '.xtrm', 'extensions'))) return c;
    }
    return candidates[0];
}

const PI_AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent');
const PI_MCP_ADAPTER_OVERRIDE_DIR = path.join(PI_AGENT_DIR, 'extensions', 'pi-mcp-adapter');
const PI_MCP_ADAPTER_REQUIRED_ENTRY = 'commands.js';
const PROJECT_EXTENSIONS_ENTRY = '../.xtrm/extensions';
const PROJECT_SKILLS_ENTRY = '../.xtrm/skills/active/pi';

// ── Extension Registry ───────────────────────────────────────────────────────

export interface ManagedExtension {
    /** Extension directory name */
    id: string;
    /** Human-readable name */
    displayName: string;
    /** Is this a library (excluded from settings.json packages list) */
    isLibrary?: boolean;
    /** Required for XTRM workflow */
    required: boolean;
}

const MANAGED_EXTENSIONS: ManagedExtension[] = [
    { id: 'core', displayName: '@xtrm/pi-core', isLibrary: true, required: true },
    { id: 'auto-session-name', displayName: 'auto-session-name', required: false },
    { id: 'auto-update', displayName: 'auto-update', required: false },
    { id: 'beads', displayName: 'beads', required: true },
    { id: 'compact-header', displayName: 'compact-header', required: false },
    { id: 'custom-footer', displayName: 'custom-footer', required: true },
    { id: 'custom-provider-qwen-cli', displayName: 'custom-provider-qwen-cli', required: false },
    { id: 'git-checkpoint', displayName: 'git-checkpoint', required: false },
    { id: 'lsp-bootstrap', displayName: 'lsp-bootstrap', required: false },
    { id: 'pi-serena-compact', displayName: 'pi-serena-compact', required: false },
    { id: 'quality-gates', displayName: 'quality-gates', required: true },
    { id: 'service-skills', displayName: 'service-skills', required: false },
    { id: 'session-flow', displayName: 'session-flow', required: true },
    { id: 'xtrm-loader', displayName: 'xtrm-loader', required: true },
    { id: 'xtrm-ui', displayName: 'xtrm-ui', required: true },
];

// ── Package Registry ─────────────────────────────────────────────────────────

export interface ManagedPackage {
    /** Package ID as used by pi (e.g., 'npm:pi-gitnexus') */
    id: string;
    /** Human-readable name */
    displayName: string;
    /** Required for XTRM workflow */
    required: boolean;
}

const MANAGED_PACKAGES: ManagedPackage[] = [
    { id: 'npm:pi-gitnexus', displayName: 'pi-gitnexus', required: true },
    { id: 'npm:pi-serena-tools', displayName: 'pi-serena-tools', required: true },
    { id: 'npm:@zenobius/pi-worktrees', displayName: 'pi-worktrees', required: true },
    { id: 'npm:@robhowley/pi-structured-return', displayName: 'pi-structured-return', required: true },
    { id: 'npm:@aliou/pi-guardrails', displayName: 'pi-guardrails', required: false },
    { id: 'npm:@aliou/pi-processes', displayName: 'pi-processes', required: true },
];

const ALWAYS_GLOBAL_INSTALL_PACKAGE_IDS = new Set<string>([
    'npm:pi-gitnexus',
    'npm:pi-serena-tools',
]);

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface ExtensionStatus {
    ext: ManagedExtension;
    installed: boolean;
    hash?: string;
    stale?: boolean;
}

export interface PackageStatus {
    pkg: ManagedPackage;
    installed: boolean;
}

export interface PiRuntimePlan {
    extensions: ExtensionStatus[];
    packages: PackageStatus[];
    missingExtensions: ExtensionStatus[];
    staleExtensions: ExtensionStatus[];
    orphanedExtensions: string[];  // Extensions in target not in source (xtrm-920d)
    missingPackages: PackageStatus[];
    allRequiredPresent: boolean;
    allPresent: boolean;
}

/**
 * Compute a hash for an extension directory based on all files.
 */
async function extensionHash(extDir: string): Promise<string> {
    if (!await fs.pathExists(extDir)) return '';

    const crypto = await import('node:crypto');
    const files = await listFilesRecursive(extDir);
    const hash = crypto.createHash('sha256');

    for (const relativeFile of files) {
        const absoluteFile = path.join(extDir, relativeFile);
        hash.update(relativeFile);
        hash.update('\0');
        hash.update(await fs.readFile(absoluteFile));
        hash.update('\0');
    }

    return hash.digest('hex');
}

async function listFilesRecursive(baseDir: string, currentDir: string = baseDir): Promise<string[]> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFilesRecursive(baseDir, fullPath));
            continue;
        }
        if (entry.isFile()) {
            files.push(path.relative(baseDir, fullPath));
        }
    }

    return files.sort();
}

/**
 * Parse `pi list` output to get installed package names.
 */
function getInstalledPiPackages(): string[] {
    const result = spawnSync('pi', ['list'], { encoding: 'utf8', stdio: 'pipe' });
    if (result.status !== 0) return [];

    const output = result.stdout;
    const packages: string[] = [];

    // Collect npm: packages from both User and Project sections
    // Project-scoped installs go to .pi/npm/node_modules/
    for (const line of output.split('\n')) {
        const match = line.match(/^\s+(npm:[\w\-/@]+)/);
        if (match) packages.push(match[1]);
    }

    return packages.sort();
}

/**
 * List extension directories in a target directory.
 */
async function listInstalledExtensions(targetDir: string): Promise<string[]> {
    if (!await fs.pathExists(targetDir)) return [];
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    return entries
        .filter(e => e.isDirectory() || e.isSymbolicLink())
        .map(e => e.name)
        .sort();
}

/**
 * Full inventory of Pi runtime state.
 */
export async function inventoryPiRuntime(
    sourceDir: string,
    targetDir: string,
): Promise<PiRuntimePlan> {
    // Extension inventory
    const installedExtNames = await listInstalledExtensions(targetDir);
    const extensionStatuses: ExtensionStatus[] = [];
    const missingExtensions: ExtensionStatus[] = [];
    const staleExtensions: ExtensionStatus[] = [];
    const orphanedExtensions: string[] = [];

    for (const ext of MANAGED_EXTENSIONS) {
        const srcPath = path.join(sourceDir, ext.id);
        const dstPath = path.join(targetDir, ext.id);

        const srcExists = await fs.pathExists(srcPath);
        const dstExists = await fs.pathExists(dstPath);

        if (!srcExists) {
            // Extension not bundled in source — skip
            continue;
        }

        if (!dstExists) {
            const status: ExtensionStatus = { ext, installed: false };
            extensionStatuses.push(status);
            missingExtensions.push(status);
            continue;
        }

        // Stale detection: if dstPath is a symlink, verify it resolves to srcPath.
        // If it's a real copy (legacy), treat as stale so it gets replaced with a symlink.
        // Skip stale check when srcPath === dstPath (verification mode: Pi reads extensions
        // directly from source dir, no copy/symlink needed).
        let isStale = false;
        if (srcPath !== dstPath) {
            const dstStat = await fs.lstat(dstPath);
            if (dstStat.isSymbolicLink()) {
                const linkTarget = await fs.readlink(dstPath);
                const resolvedTarget = path.resolve(path.dirname(dstPath), linkTarget);
                isStale = resolvedTarget !== path.resolve(srcPath);
            } else {
                // Real copy — replace with symlink
                isStale = true;
            }
        }
        const status: ExtensionStatus = {
            ext,
            installed: true,
            stale: isStale,
        };
        extensionStatuses.push(status);

        if (isStale) {
            staleExtensions.push(status);
        }
    }

    // Detect orphaned extensions (in target but not in source registry)
    const managedIds = new Set(MANAGED_EXTENSIONS.map(e => e.id));
    for (const name of installedExtNames) {
        if (!managedIds.has(name)) {
            orphanedExtensions.push(name);
        }
    }

    // Package inventory
    const installedPkgIds = getInstalledPiPackages();
    const packageStatuses: PackageStatus[] = [];
    const missingPackages: PackageStatus[] = [];

    for (const pkg of MANAGED_PACKAGES) {
        const isInstalled = installedPkgIds.includes(pkg.id);
        const status: PackageStatus = { pkg, installed: isInstalled };
        packageStatuses.push(status);

        if (!isInstalled) {
            missingPackages.push(status);
        }
    }

    const allRequiredPresent =
        missingExtensions.every(s => !s.ext.required) &&
        staleExtensions.every(s => !s.ext.required) &&
        missingPackages.every(s => !s.pkg.required);

    const allPresent =
        missingExtensions.length === 0 &&
        staleExtensions.length === 0 &&
        orphanedExtensions.length === 0 &&
        missingPackages.length === 0;

    return {
        extensions: extensionStatuses,
        packages: packageStatuses,
        missingExtensions,
        staleExtensions,
        orphanedExtensions,
        missingPackages,
        allRequiredPresent,
        allPresent,
    };
}

// ── Plan Rendering ───────────────────────────────────────────────────────────

export function renderPiRuntimePlan(plan: PiRuntimePlan): void {
    console.log(kleur.bold('\n  Pi Runtime'));
    console.log(kleur.dim('  ' + '-'.repeat(50)));

    // Extensions
    const extTotal = plan.extensions.length;
    const extOk = plan.extensions.filter(s => s.installed && !s.stale).length;

    console.log(kleur.dim(`  Extensions: ${extOk}/${extTotal} up-to-date`));

    if (plan.missingExtensions.length > 0) {
        const names = plan.missingExtensions.map(s => s.ext.displayName).join(', ');
        console.log(kleur.yellow(`  Missing:    ${names}`));
    }

    if (plan.staleExtensions.length > 0) {
        const names = plan.staleExtensions.map(s => s.ext.displayName).join(', ');
        console.log(kleur.yellow(`  Stale:      ${names}`));
    }

    if (plan.orphanedExtensions.length > 0) {
        const names = plan.orphanedExtensions.join(', ');
        console.log(kleur.red(`  Orphaned:   ${names} (will remove)`));
    }

    // Packages
    const pkgTotal = plan.packages.length;
    const pkgOk = plan.packages.filter(s => s.installed).length;

    console.log(kleur.dim(`  Packages:   ${pkgOk}/${pkgTotal} installed`));

    if (plan.missingPackages.length > 0) {
        const names = plan.missingPackages.map(s => s.pkg.displayName).join(', ');
        console.log(kleur.yellow(`  Missing:    ${names}`));
    }

    console.log(kleur.dim('  ' + '-'.repeat(50)));

    if (plan.allPresent) {
        console.log(t.success('  ✓ All extensions and packages present.\n'));
    } else if (plan.allRequiredPresent) {
        console.log(t.success('  ✓ All required items present.'));
        const optionalMissing = [
            ...plan.missingExtensions.filter(s => !s.ext.required),
            ...plan.missingPackages.filter(s => !s.pkg.required),
        ];
        if (optionalMissing.length > 0) {
            const names = optionalMissing.map(s => 
                'ext' in s ? s.ext.displayName : s.pkg.displayName
            ).join(', ');
            console.log(kleur.dim(`  ○ Optional not installed: ${names}\n`));
        } else {
            console.log('');
        }
    } else {
        console.log(kleur.yellow('  ⚠ Missing required items.\n'));
    }
}

// ── Sync Execution ───────────────────────────────────────────────────────────

export interface PiSyncOptions {
    /** Dry run — print what would happen but don't write */
    dryRun?: boolean;
    /** Install to global ~/.pi/agent/ (default: project-scoped) */
    isGlobal?: boolean;
    /** Project root for project-scoped installs */
    projectRoot?: string;
    /** Remove orphaned extensions (xtrm-920d mirror behavior) */
    removeOrphaned?: boolean;
    /** Log function for progress messages */
    log?: (message: string) => void;
}

export interface PiSyncResult {
    extensionsAdded: string[];
    extensionsUpdated: string[];
    extensionsRemoved: string[];
    packagesInstalled: string[];
    failed: string[];
}

function mergePiSyncResults(base: PiSyncResult, incoming: PiSyncResult): PiSyncResult {
    return {
        extensionsAdded: [...base.extensionsAdded, ...incoming.extensionsAdded],
        extensionsUpdated: [...base.extensionsUpdated, ...incoming.extensionsUpdated],
        extensionsRemoved: [...base.extensionsRemoved, ...incoming.extensionsRemoved],
        packagesInstalled: [...base.packagesInstalled, ...incoming.packagesInstalled],
        failed: [...base.failed, ...incoming.failed],
    };
}

function parseNpmPackageName(piPackageId: string): string | null {
    if (!piPackageId.startsWith('npm:')) return null;
    const npmPackageName = piPackageId.slice(4).trim();
    return npmPackageName.length > 0 ? npmPackageName : null;
}

async function isPackagePresentInPiAgent(agentDir: string, piPackageId: string): Promise<boolean> {
    const npmPackageName = parseNpmPackageName(piPackageId);
    if (!npmPackageName) return false;

    const packageDir = path.join(agentDir, 'npm', 'node_modules', npmPackageName);
    return fs.pathExists(packageDir);
}

export type PiPackageInstallRunner = (piPackageId: string) => number | null;

export async function ensureAlwaysGlobalPiPackages(
    dryRun: boolean,
    log?: (message: string) => void,
    agentDir: string = PI_AGENT_DIR,
    installRunner: PiPackageInstallRunner = (piPackageId) => {
        const installResult = spawnSync('pi', ['install', piPackageId], { stdio: 'pipe', encoding: 'utf8' });
        return installResult.status;
    },
): Promise<{ installed: string[]; failed: string[] }> {
    const installed: string[] = [];
    const failed: string[] = [];

    const packagesToEnsure = MANAGED_PACKAGES.filter(pkg => ALWAYS_GLOBAL_INSTALL_PACKAGE_IDS.has(pkg.id));

    for (const pkg of packagesToEnsure) {
        if (await isPackagePresentInPiAgent(agentDir, pkg.id)) {
            continue;
        }

        if (dryRun) {
            log?.(`[DRY RUN] pi install ${pkg.id}`);
            continue;
        }

        const installStatus = installRunner(pkg.id);
        if (installStatus === 0) {
            installed.push(pkg.id);
            log?.(`${sym.ok} ${pkg.displayName} (global)`);
            continue;
        }

        failed.push(pkg.id);
        log?.(kleur.yellow(`⚠ ${pkg.displayName} — global install failed`));
    }

    return { installed, failed };
}

/**
 * Ensure @xtrm/pi-core is resolvable from .xtrm/extensions/node_modules/@xtrm/pi-core.
 * Creates a symlink pointing to the actual core source (not a mirror).
 */
export type CoreSymlinkStatus = 'missing-source' | 'ok' | 'created' | 'repaired' | 'would-create' | 'would-repair';

export async function ensureCorePackageSymlink(
    coreSrcDir: string,    // path to .xtrm/extensions/core (the actual source)
    projectRoot: string,
    dryRun: boolean,
    log?: (message: string) => void,
): Promise<CoreSymlinkStatus> {
    if (!await fs.pathExists(coreSrcDir)) return 'missing-source';

    // Place symlink in .xtrm/extensions/node_modules/@xtrm/pi-core so that
    // Node.js module resolution from any extension under .xtrm/extensions/
    // can find @xtrm/pi-core by traversing up to .xtrm/extensions/node_modules/.
    // (.pi/node_modules/ is NOT on the resolution path from .xtrm/extensions/.)
    const extensionsDir = path.join(projectRoot, '.xtrm', 'extensions');
    const nodeModulesDir = path.join(extensionsDir, 'node_modules', '@xtrm');
    const symlinkPath = path.join(nodeModulesDir, 'pi-core');
    const expectedTarget = path.resolve(coreSrcDir);

    // Use lstat (not pathExists) so we detect broken symlinks too
    const existing = await fs.lstat(symlinkPath).catch(() => null);
    if (existing) {
        if (existing.isSymbolicLink()) {
            const currentLinkTarget = await fs.readlink(symlinkPath);
            const resolvedTarget = path.resolve(path.dirname(symlinkPath), currentLinkTarget);
            if (resolvedTarget === expectedTarget) {
                return 'ok';
            }
        }

        if (dryRun) {
            log?.(kleur.dim('[DRY RUN] would repair @xtrm/pi-core symlink target'));
            return 'would-repair';
        }

        await fs.remove(symlinkPath);
        await fs.ensureDir(nodeModulesDir);
        const relTarget = path.relative(nodeModulesDir, coreSrcDir);
        await fs.symlink(relTarget, symlinkPath);
        log?.(kleur.dim('Repaired @xtrm/pi-core symlink → .xtrm/extensions/node_modules/@xtrm/pi-core'));
        return 'repaired';
    }

    if (dryRun) {
        log?.(kleur.dim('[DRY RUN] would create @xtrm/pi-core symlink'));
        return 'would-create';
    }

    await fs.ensureDir(nodeModulesDir);
    const relTarget = path.relative(nodeModulesDir, coreSrcDir);
    await fs.symlink(relTarget, symlinkPath);
    log?.(kleur.dim('Created @xtrm/pi-core symlink → .xtrm/extensions/node_modules/@xtrm/pi-core'));
    return 'created';
}

export interface PiMcpAdapterOverrideCheck {
    path: string;
    found: boolean;
    stale: boolean;
    remediated: boolean;
    reason?: string;
}

export interface PiLaunchPreflightResult {
    coreSymlinkStatus: CoreSymlinkStatus;
    staleOverride: PiMcpAdapterOverrideCheck;
}

export async function remediateStalePiMcpAdapterOverride(
    dryRun: boolean,
    log?: (message: string) => void,
): Promise<PiMcpAdapterOverrideCheck> {
    const stat = await fs.lstat(PI_MCP_ADAPTER_OVERRIDE_DIR).catch(() => null);
    if (!stat) {
        return {
            path: PI_MCP_ADAPTER_OVERRIDE_DIR,
            found: false,
            stale: false,
            remediated: false,
        };
    }

    if (stat.isSymbolicLink()) {
        return {
            path: PI_MCP_ADAPTER_OVERRIDE_DIR,
            found: true,
            stale: false,
            remediated: false,
        };
    }

    const hasRequiredEntry = await fs.pathExists(path.join(PI_MCP_ADAPTER_OVERRIDE_DIR, PI_MCP_ADAPTER_REQUIRED_ENTRY));
    if (stat.isDirectory() && hasRequiredEntry) {
        return {
            path: PI_MCP_ADAPTER_OVERRIDE_DIR,
            found: true,
            stale: false,
            remediated: false,
        };
    }

    const reason = stat.isDirectory()
        ? `missing ${PI_MCP_ADAPTER_REQUIRED_ENTRY}`
        : 'not a directory/symlink';

    if (dryRun) {
        log?.(kleur.dim(`[DRY RUN] would remove stale pi-mcp-adapter override (${reason})`));
        return {
            path: PI_MCP_ADAPTER_OVERRIDE_DIR,
            found: true,
            stale: true,
            remediated: false,
            reason,
        };
    }

    await fs.remove(PI_MCP_ADAPTER_OVERRIDE_DIR);
    log?.(kleur.dim(`Removed stale pi-mcp-adapter override (${reason})`));
    return {
        path: PI_MCP_ADAPTER_OVERRIDE_DIR,
        found: true,
        stale: true,
        remediated: true,
        reason,
    };
}

export async function runPiLaunchPreflight(
    projectRoot: string,
    dryRun: boolean,
    log?: (message: string) => void,
): Promise<PiLaunchPreflightResult> {
    const staleOverride = await remediateStalePiMcpAdapterOverride(dryRun, log);
    const coreSymlinkStatus = await ensureCorePackageSymlink(
        path.join(projectRoot, '.xtrm', 'extensions', 'core'),
        projectRoot,
        dryRun,
        log,
    );

    return {
        coreSymlinkStatus,
        staleOverride,
    };
}

/**
 * Update .pi/settings.json with extension package paths.
 * Pi only auto-discovers global extensions — project-scoped needs settings.json.
 */
function isXtrmExtensionsSetting(entry: string): boolean {
    const normalizedEntry = entry.replaceAll('\\', '/').replace(/\/$/, '');
    return normalizedEntry === PROJECT_EXTENSIONS_ENTRY || normalizedEntry === '.xtrm/extensions';
}

async function cleanupLegacyProjectExtensionCopies(
    projectRoot: string,
    dryRun: boolean,
    log?: (message: string) => void,
): Promise<{ removed: string[]; failed: string[] }> {
    const piSettingsPath = path.join(projectRoot, '.pi', 'settings.json');

    let existingSettings: { extensions?: string[] } = {};
    try {
        existingSettings = await fs.readJson(piSettingsPath);
    } catch {
        return { removed: [], failed: [] };
    }

    const pointsToXtrmExtensions = (existingSettings.extensions ?? []).some(isXtrmExtensionsSetting);
    if (!pointsToXtrmExtensions) return { removed: [], failed: [] };

    const legacyExtensionsDir = path.join(projectRoot, '.pi', 'extensions');
    if (!await fs.pathExists(legacyExtensionsDir)) return { removed: [], failed: [] };

    const removed: string[] = [];
    const failed: string[] = [];

    for (const ext of MANAGED_EXTENSIONS) {
        const legacyExtPath = path.join(legacyExtensionsDir, ext.id);
        const legacyStat = await fs.lstat(legacyExtPath).catch(() => null);
        if (!legacyStat || legacyStat.isSymbolicLink() || !legacyStat.isDirectory()) {
            continue;
        }

        if (dryRun) {
            log?.(kleur.dim(`[DRY RUN] - .pi/extensions/${ext.id} (legacy copy)`));
            continue;
        }

        try {
            await fs.remove(legacyExtPath);
            removed.push(ext.id);
            log?.(kleur.dim(`Removed legacy .pi/extensions/${ext.id}`));
        } catch (err) {
            failed.push(ext.id);
            log?.(kleur.red(`✗ Failed to remove legacy .pi/extensions/${ext.id}: ${err}`));
        }
    }

    return { removed, failed };
}

async function updatePiSettings(
    projectRoot: string,
    dryRun: boolean,
    log?: (message: string) => void,
): Promise<void> {
    const piSettingsPath = path.join(projectRoot, '.pi', 'settings.json');

    if (dryRun) {
        log?.(kleur.dim(`[DRY RUN] would update .pi/settings.json`));
        return;
    }

    let existingSettings: { extensions?: string[]; skills?: string[]; packages?: string[] } = {};
    try {
        existingSettings = await fs.readJson(piSettingsPath);
    } catch { /* no existing settings */ }

    // Preserve user packages (npm:/git:/local), strip any old per-extension entries
    const existingPackages = (existingSettings.packages ?? []).filter(
        p => !p.startsWith('./extensions/')
    );

    await fs.ensureDir(path.join(projectRoot, '.pi'));
    await fs.writeJson(piSettingsPath, {
        ...existingSettings,
        extensions: [],  // Empty = Pi uses default global path (~/.pi/agent/extensions/)
        skills: [PROJECT_SKILLS_ENTRY],
        packages: existingPackages,
    }, { spaces: 2 });
    log?.(kleur.dim(`Updated .pi/settings.json → global extensions + .xtrm/skills/active/pi`));
}

/**
 * Execute Pi runtime sync.
 */
export async function executePiSync(
    plan: PiRuntimePlan,
    sourceDir: string,
    targetDir: string,
    opts: PiSyncOptions = {},
): Promise<PiSyncResult> {
    const {
        dryRun = false,
        isGlobal = false,
        projectRoot,
        removeOrphaned = true,
        log = (msg) => console.log(kleur.dim(`    ${msg}`)),
    } = opts;

    const result: PiSyncResult = {
        extensionsAdded: [],
        extensionsUpdated: [],
        extensionsRemoved: [],
        packagesInstalled: [],
        failed: [],
    };

    // Ensure target directory exists
    if (!dryRun) {
        await fs.ensureDir(targetDir);
    }

    // Sync missing + stale extensions
    const toSync = [...plan.missingExtensions, ...plan.staleExtensions];

    for (const status of toSync) {
        const { ext } = status;
        const srcPath = path.join(sourceDir, ext.id);
        const dstPath = path.join(targetDir, ext.id);

        if (dryRun) {
            log(`[DRY RUN] ${status.installed ? '↻' : '+'} ${ext.displayName}`);
            continue;
        }

        try {
            // Remove stale copy/symlink, then create a relative symlink into .xtrm/extensions
            await fs.remove(dstPath);
            const relTarget = path.relative(targetDir, srcPath);
            await fs.symlink(relTarget, dstPath);
            if (status.installed) {
                result.extensionsUpdated.push(ext.id);
                log(`↻ ${ext.displayName} (symlinked)`);
            } else {
                result.extensionsAdded.push(ext.id);
                log(`+ ${ext.displayName} (symlinked)`);
            }
        } catch (err) {
            result.failed.push(ext.id);
            log(kleur.red(`✗ ${ext.displayName}: ${err}`));
        }
    }

    // Remove orphaned extensions (xtrm-920d)
    if (removeOrphaned && plan.orphanedExtensions.length > 0) {
        for (const orphanId of plan.orphanedExtensions) {
            const orphanPath = path.join(targetDir, orphanId);

            if (dryRun) {
                log(kleur.red(`[DRY RUN] - ${orphanId} (orphaned)`));
                continue;
            }

            try {
                await fs.remove(orphanPath);
                result.extensionsRemoved.push(orphanId);
                log(kleur.red(`- ${orphanId} (orphaned)`));
            } catch (err) {
                result.failed.push(orphanId);
                log(kleur.red(`✗ ${orphanId}: ${err}`));
            }
        }
    }

    // Install missing packages
    for (const status of plan.missingPackages) {
        const { pkg } = status;
        const installArgs = isGlobal
            ? ['install', pkg.id]
            : ['install', pkg.id, '-l'];

        if (dryRun) {
            log(`[DRY RUN] pi ${installArgs.join(' ')}`);
            continue;
        }

        try {
            const r = spawnSync('pi', installArgs, { stdio: 'pipe', encoding: 'utf8' });
            if (r.status === 0) {
                result.packagesInstalled.push(pkg.id);
                log(`${sym.ok} ${pkg.displayName}`);
            } else {
                result.failed.push(pkg.id);
                log(kleur.yellow(`⚠ ${pkg.displayName} — install failed`));
            }
        } catch (err) {
            result.failed.push(pkg.id);
            log(kleur.red(`✗ ${pkg.displayName}: ${err}`));
        }
    }

    return result;
}

// ── @xtrm/pi-core Resolution ────────────────────────────────────────────────

/**
 * Ensure @xtrm/pi-core is resolvable from project extensions.
 * Creates symlink: .xtrm/extensions/node_modules/@xtrm/pi-core → ../core
 */
export async function ensurePiCoreResolution(
    repoRoot: string,
    dryRun: boolean = false,
    log: (message: string) => void = (msg) => console.log(kleur.dim(`    ${msg}`)),
): Promise<{ ok: boolean; created: boolean }> {
    const repoExtDir = path.join(repoRoot, '.xtrm', 'extensions');
    const coreDir = path.join(repoExtDir, 'core');

    if (!await fs.pathExists(coreDir)) {
        log('No .xtrm/extensions/core/ found — skipping pi-core resolution');
        return { ok: false, created: false };
    }

    const nodeModulesDir = path.join(repoExtDir, 'node_modules', '@xtrm');
    const symlinkPath = path.join(nodeModulesDir, 'pi-core');
    const relativeTarget = path.join('..', '..', 'core');

    if (dryRun) {
        log('[DRY RUN] would create @xtrm/pi-core symlink');
        return { ok: true, created: false };
    }

    try {
        const existing = await fs.lstat(symlinkPath).catch(() => null);
        if (existing) {
            if (existing.isSymbolicLink()) {
                const currentTarget = await fs.readlink(symlinkPath);
                const resolvedTarget = path.resolve(path.dirname(symlinkPath), currentTarget);
                if (resolvedTarget === path.resolve(coreDir)) {
                    return { ok: true, created: false };
                }
            }
            await fs.remove(symlinkPath);
        }

        await fs.ensureDir(nodeModulesDir);
        await fs.symlink(relativeTarget, symlinkPath);
        log('✓ @xtrm/pi-core symlink → .xtrm/extensions/node_modules/@xtrm/pi-core');
        return { ok: true, created: true };
    } catch (err) {
        log(kleur.yellow(`⚠ @xtrm/pi-core symlink: ${err}`));
        return { ok: false, created: false };
    }
}

// ── Full Sync Flow ───────────────────────────────────────────────────────────

export interface PiRuntimeOptions {
    dryRun?: boolean;
    isGlobal?: boolean;
    projectRoot?: string;
}

/**
 * Run full Pi runtime sync flow: inventory -> plan -> sync.
 *
 * Global installs mirror extensions into ~/.pi/agent/extensions/ (Pi reads them automatically).
 * Project installs skip the extension mirror — Pi discovers extensions directly via
 * .pi/settings.json pointing at ../.xtrm/extensions. Only packages are synced for project installs.
 */
export async function runPiRuntimeSync(opts: PiRuntimeOptions = {}): Promise<PiSyncResult> {
    const { dryRun = false, isGlobal = false, projectRoot } = opts;

    const pkgRoot = resolvePkgRoot();
    const sourceDir = path.join(pkgRoot, '.xtrm', 'extensions');
    const resolvedProjectRoot = projectRoot || process.cwd();
    const log = (msg: string) => console.log(kleur.dim(`    ${msg}`));

    const emptyResult: PiSyncResult = {
        extensionsAdded: [],
        extensionsUpdated: [],
        extensionsRemoved: [],
        packagesInstalled: [],
        failed: [],
    };
    const result: PiSyncResult = { ...emptyResult };

    if (!await fs.pathExists(sourceDir)) {
        console.log(kleur.dim('\n  Managed extensions: skipped (not bundled in npm package)\n'));
        return result;
    }

    const preflight = await runPiLaunchPreflight(resolvedProjectRoot, dryRun, log);
    if (preflight.staleOverride.remediated) {
        result.extensionsRemoved.push('pi-mcp-adapter');
    }

    // ── Global install: mirror extensions into ~/.pi/agent/extensions/ ──────────
    if (isGlobal) {
        const targetDir = path.join(PI_AGENT_DIR, 'extensions');
        const plan = await inventoryPiRuntime(sourceDir, targetDir);
        renderPiRuntimePlan(plan);
        if (plan.allPresent) return result;
        const synced = await executePiSync(plan, sourceDir, targetDir, {
            dryRun,
            isGlobal: true,
            removeOrphaned: true,
        });
        return mergePiSyncResults(result, synced);
    }

    // ── Project install: ensure @xtrm/pi-core resolves ───────────────────────────
    // Pi auto-discovers .xtrm/extensions/ at project level. We only need to
    // ensure @xtrm/pi-core can be resolved by extensions that import it.

    await ensurePiCoreResolution(resolvedProjectRoot, dryRun, log);

    const installedPkgIds = getInstalledPiPackages();
    const packageStatuses: PackageStatus[] = [];
    const missingPackages: PackageStatus[] = [];

    for (const pkg of MANAGED_PACKAGES) {
        const isInstalled = installedPkgIds.includes(pkg.id);
        const status: PackageStatus = { pkg, installed: isInstalled };
        packageStatuses.push(status);
        if (!isInstalled) missingPackages.push(status);
    }

    // Render summary
    console.log(kleur.bold('\n  Pi Runtime'));
    console.log(kleur.dim('  ' + '-'.repeat(50)));
    console.log(kleur.dim(`  Extensions: .xtrm/extensions/ (auto-discovered)`));
    const pkgOk = packageStatuses.filter(s => s.installed).length;
    console.log(kleur.dim(`  Packages:   ${pkgOk}/${packageStatuses.length} installed`));
    if (missingPackages.length > 0) {
        const names = missingPackages.map(s => s.pkg.displayName).join(', ');
        console.log(kleur.yellow(`  Missing:    ${names}`));
    }
    console.log(kleur.dim('  ' + '-'.repeat(50)));

    const legacyCleanup = await cleanupLegacyProjectExtensionCopies(resolvedProjectRoot, dryRun, log);
    result.extensionsRemoved.push(...legacyCleanup.removed);
    result.failed.push(...legacyCleanup.failed);

    // Install missing packages
    for (const status of missingPackages) {
        const { pkg } = status;
        if (dryRun) {
            log(`[DRY RUN] pi install ${pkg.id} -l`);
            continue;
        }
        try {
            const r = spawnSync('pi', ['install', pkg.id, '-l'], { stdio: 'pipe', encoding: 'utf8' });
            if (r.status === 0) {
                result.packagesInstalled.push(pkg.id);
                log(`${sym.ok} ${pkg.displayName}`);
            } else {
                result.failed.push(pkg.id);
                log(kleur.yellow(`⚠ ${pkg.displayName} — install failed`));
            }
        } catch (err) {
            result.failed.push(pkg.id);
            log(kleur.red(`✗ ${pkg.displayName}: ${err}`));
        }
    }

    const alwaysGlobalInstallResult = await ensureAlwaysGlobalPiPackages(dryRun, log);
    result.packagesInstalled.push(...alwaysGlobalInstallResult.installed);
    result.failed.push(...alwaysGlobalInstallResult.failed);

    // Always rebuild active Pi skills view + update settings.json for project installs.
    const skillsRoot = resolveSkillsRoot(resolvedProjectRoot);
    if (await fs.pathExists(path.join(skillsRoot, 'default'))) {
        const invariantViolations = await validateSkillsInvariants(skillsRoot);
        if (invariantViolations.length > 0) {
            const summary = invariantViolations.map(violation => `${violation.code}: ${violation.message}`).join('; ');
            throw new Error(`Skills invariants failed. ${summary}`);
        }

        if (!dryRun) {
            await rebuildRuntimeActiveView('pi', skillsRoot);
        }
    }

    await updatePiSettings(resolvedProjectRoot, dryRun, log);

    // Base summary on what failed, not on pre-install missingPackages list
    const requiredFailed = missingPackages.filter(
        s => s.pkg.required && result.failed.includes(s.pkg.id)
    );
    if (missingPackages.length === 0 || result.failed.length === 0) {
        console.log(t.success('  ✓ All required items present.\n'));
    } else if (requiredFailed.length === 0) {
        console.log(t.success('  ✓ All required items present.\n'));
    } else {
        console.log(kleur.yellow('  ⚠ Missing required items.\n'));
    }

    return result;
}
