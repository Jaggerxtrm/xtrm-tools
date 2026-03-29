/**
 * Unified verification for xtrm init phases.
 *
 * Summarizes outcomes from all installer phases in one place:
 * - Machine bootstrap (third-party CLIs)
 * - Claude runtime (xtrm-tools plugin + official plugins)
 * - Pi runtime (extensions + packages)
 * - Project bootstrap (beads, GitNexus, instruction headers)
 */

import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import kleur from 'kleur';
import path from 'path';
import { t, sym } from '../utils/theme.js';
import { inventoryDeps, type BootstrapPlan } from './machine-bootstrap.js';
import { inventoryPiRuntime, type PiRuntimePlan } from './pi-runtime.js';

export interface VerificationResult {
    machineBootstrap: {
        allRequiredPresent: boolean;
        missingRequired: string[];
    };
    claudeRuntime: {
        xtrmToolsPlugin: boolean;
        officialPlugins: string[];
        missingPlugins: string[];
    };
    piRuntime: {
        allRequiredPresent: boolean;
        missingExtensions: string[];
        missingPackages: string[];
    };
    projectBootstrap: {
        beadsInitialized: boolean;
        gitnexusIndexed: boolean;
        instructionHeaders: boolean;
    };
    allPassed: boolean;
}

// ── Phase-specific checks ────────────────────────────────────────────────────

function verifyMachineBootstrap(): BootstrapPlan {
    return inventoryDeps();
}

function verifyClaudeRuntime(): { xtrmToolsPlugin: boolean; officialPlugins: string[]; missingPlugins: string[] } {
    const OFFICIAL_PLUGINS = [
        'serena@claude-plugins-official',
        'context7@claude-plugins-official',
        'github@claude-plugins-official',
        'ralph-loop@claude-plugins-official',
    ];

    const result = spawnSync('claude', ['plugin', 'list'], { encoding: 'utf8', stdio: 'pipe' });
    const output = result.stdout ?? '';

    const xtrmToolsPlugin = output.includes('xtrm-tools@xtrm-tools') || output.includes('xtrm-tools');
    const officialPlugins: string[] = [];
    const missingPlugins: string[] = [];

    for (const pluginId of OFFICIAL_PLUGINS) {
        if (output.includes(pluginId)) {
            officialPlugins.push(pluginId);
        } else {
            missingPlugins.push(pluginId);
        }
    }

    return { xtrmToolsPlugin, officialPlugins, missingPlugins };
}

async function verifyPiRuntime(projectRoot: string): Promise<PiRuntimePlan> {
    const pkgRoot = resolvePkgRoot();
    const sourceDir = path.join(pkgRoot, 'config', 'pi', 'extensions');
    const targetDir = path.join(projectRoot, '.pi', 'extensions');

    if (!await fs.pathExists(sourceDir)) {
        // Not bundled — return empty plan
        return {
            extensions: [],
            packages: [],
            missingExtensions: [],
            staleExtensions: [],
            orphanedExtensions: [],
            missingPackages: [],
            allRequiredPresent: true,
            allPresent: true,
        };
    }

    return await inventoryPiRuntime(sourceDir, targetDir);
}

function verifyProjectBootstrap(projectRoot: string): { beadsInitialized: boolean; gitnexusIndexed: boolean; instructionHeaders: boolean } {
    const beadsInitialized = fs.pathExistsSync(path.join(projectRoot, '.beads'));

    const gnStatus = spawnSync('gitnexus', ['status'], { cwd: projectRoot, encoding: 'utf8', timeout: 5000 });
    const gnText = `${gnStatus.stdout ?? ''}\n${gnStatus.stderr ?? ''}`.toLowerCase();
    const gitnexusIndexed = gnStatus.status === 0 &&
        !gnText.includes('stale') &&
        !gnText.includes('not indexed') &&
        !gnText.includes('missing');

    const agentsMd = fs.pathExistsSync(path.join(projectRoot, 'AGENTS.md'));
    const claudeMd = fs.pathExistsSync(path.join(projectRoot, 'CLAUDE.md'));
    const instructionHeaders = agentsMd || claudeMd;

    return { beadsInitialized, gitnexusIndexed, instructionHeaders };
}

// ── Resolve package root ──────────────────────────────────────────────────────

declare const __dirname: string;

function resolvePkgRoot(): string {
    const candidates = [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../..'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, 'config', 'pi', 'extensions'))) return c;
    }
    return candidates[0];
}

// ── Full verification ─────────────────────────────────────────────────────────

export async function runInitVerification(projectRoot: string): Promise<VerificationResult> {
    const machinePlan = verifyMachineBootstrap();
    const claudeResult = verifyClaudeRuntime();
    const piPlan = await verifyPiRuntime(projectRoot);
    const projectResult = verifyProjectBootstrap(projectRoot);

    const allPassed =
        machinePlan.allRequiredPresent &&
        claudeResult.xtrmToolsPlugin &&
        claudeResult.missingPlugins.length === 0 &&
        piPlan.allRequiredPresent &&
        projectResult.beadsInitialized;

    return {
        machineBootstrap: {
            allRequiredPresent: machinePlan.allRequiredPresent,
            missingRequired: machinePlan.missingRequired.map(d => d.dep.displayName),
        },
        claudeRuntime: {
            xtrmToolsPlugin: claudeResult.xtrmToolsPlugin,
            officialPlugins: claudeResult.officialPlugins,
            missingPlugins: claudeResult.missingPlugins,
        },
        piRuntime: {
            allRequiredPresent: piPlan.allRequiredPresent,
            missingExtensions: piPlan.missingExtensions.filter(s => s.ext.required).map(s => s.ext.displayName),
            missingPackages: piPlan.missingPackages.filter(s => s.pkg.required).map(s => s.pkg.displayName),
        },
        projectBootstrap: projectResult,
        allPassed,
    };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

export function renderVerificationSummary(result: VerificationResult): void {
    console.log(kleur.bold('\n  Verification Summary'));
    console.log(kleur.dim('  ' + '─'.repeat(50)));

    // Machine bootstrap
    const mbIcon = result.machineBootstrap.allRequiredPresent ? sym.ok : sym.warn;
    const mbLabel = 'Machine Bootstrap';
    if (result.machineBootstrap.allRequiredPresent) {
        console.log(`  ${mbIcon} ${mbLabel}`);
    } else {
        const missing = result.machineBootstrap.missingRequired.join(', ');
        console.log(`  ${mbIcon} ${mbLabel} — missing: ${missing}`);
    }

    // Claude runtime
    const crIcon = result.claudeRuntime.xtrmToolsPlugin && result.claudeRuntime.missingPlugins.length === 0
        ? sym.ok : sym.warn;
    const crLabel = 'Claude Runtime';
    if (result.claudeRuntime.xtrmToolsPlugin && result.claudeRuntime.missingPlugins.length === 0) {
        console.log(`  ${crIcon} ${crLabel}`);
    } else if (!result.claudeRuntime.xtrmToolsPlugin) {
        console.log(`  ${crIcon} ${crLabel} — missing xtrm-tools plugin`);
    } else {
        const missing = result.claudeRuntime.missingPlugins.join(', ');
        console.log(`  ${crIcon} ${crLabel} — missing plugins: ${missing}`);
    }

    // Pi runtime
    const prIcon = result.piRuntime.allRequiredPresent ? sym.ok : sym.warn;
    const prLabel = 'Pi Runtime';
    if (result.piRuntime.allRequiredPresent) {
        console.log(`  ${prIcon} ${prLabel}`);
    } else {
        const parts: string[] = [];
        if (result.piRuntime.missingExtensions.length > 0) {
            parts.push(`extensions: ${result.piRuntime.missingExtensions.join(', ')}`);
        }
        if (result.piRuntime.missingPackages.length > 0) {
            parts.push(`packages: ${result.piRuntime.missingPackages.join(', ')}`);
        }
        console.log(`  ${prIcon} ${prLabel} — ${parts.join('; ')}`);
    }

    // Project bootstrap
    const pbParts: string[] = [];
    if (!result.projectBootstrap.beadsInitialized) pbParts.push('beads');
    if (!result.projectBootstrap.gitnexusIndexed) pbParts.push('gitnexus');
    if (!result.projectBootstrap.instructionHeaders) pbParts.push('headers');
    const pbIcon = pbParts.length === 0 ? sym.ok : sym.warn;
    const pbLabel = 'Project Bootstrap';
    if (pbParts.length === 0) {
        console.log(`  ${pbIcon} ${pbLabel}`);
    } else {
        console.log(`  ${pbIcon} ${pbLabel} — incomplete: ${pbParts.join(', ')}`);
    }

    console.log(kleur.dim('  ' + '─'.repeat(50)));

    if (result.allPassed) {
        console.log(t.success('\n  ✓ All phases verified successfully.\n'));
    } else {
        console.log(t.warning('\n  ⚠ Some phases incomplete. Re-run `xtrm init` to fix.\n'));
    }
}