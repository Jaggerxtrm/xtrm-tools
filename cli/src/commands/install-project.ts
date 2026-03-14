import { Command } from 'commander';
import kleur from 'kleur';
import path from 'path';
import fs from 'fs-extra';
import { spawnSync } from 'child_process';
import { installGitHooks as installServiceGitHooks } from './install-service-skills.js';

declare const __dirname: string;
function resolvePkgRoot(): string {
    const candidates = [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../..'),
    ];

    const match = candidates.find(candidate => fs.existsSync(path.join(candidate, 'project-skills')));
    if (!match) {
        throw new Error('Unable to locate project-skills directory from CLI runtime.');
    }
    return match;
}

const PKG_ROOT = resolvePkgRoot();
const PROJECT_SKILLS_DIR = path.join(PKG_ROOT, 'project-skills');
const MCP_CORE_CONFIG_PATH = path.join(PKG_ROOT, 'config', 'mcp_servers.json');
const syncedProjectMcpRoots = new Set<string>();

function resolveEnvVars(value: string): string {
    if (typeof value !== 'string') return value;
    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, name) => process.env[name] || '');
}

function hasClaudeCli(): boolean {
    const r = spawnSync('claude', ['--version'], { stdio: 'pipe' });
    return r.status === 0;
}

function buildProjectMcpArgs(name: string, server: any): string[] | null {
    const transport = server.type || (server.url?.includes('/sse') ? 'sse' : 'http');

    if (server.command) {
        const args = ['mcp', 'add', '-s', 'project'];
        if (server.env && typeof server.env === 'object') {
            for (const [k, v] of Object.entries(server.env)) {
                args.push('-e', `${k}=${resolveEnvVars(String(v))}`);
            }
        }
        args.push(name, '--', server.command, ...((server.args || []) as string[]));
        return args;
    }

    if (server.url || server.serverUrl) {
        const url = server.url || server.serverUrl;
        const args = ['mcp', 'add', '-s', 'project', '--transport', transport, name, url];
        if (server.headers && typeof server.headers === 'object') {
            for (const [k, v] of Object.entries(server.headers)) {
                args.push('--header', `${k}: ${resolveEnvVars(String(v))}`);
            }
        }
        return args;
    }

    return null;
}

async function syncProjectMcpServers(projectRoot: string): Promise<void> {
    if (syncedProjectMcpRoots.has(projectRoot)) return;
    syncedProjectMcpRoots.add(projectRoot);

    if (!await fs.pathExists(MCP_CORE_CONFIG_PATH)) return;

    console.log(kleur.bold('\n── Installing MCP (project scope) ─────────'));

    if (!hasClaudeCli()) {
        console.log(kleur.yellow('  ⚠ Claude CLI not found; skipping project-scope MCP registration.'));
        return;
    }

    const mcpConfig = await fs.readJson(MCP_CORE_CONFIG_PATH);
    const servers = Object.entries(mcpConfig?.mcpServers ?? {}) as Array<[string, any]>;
    if (servers.length === 0) {
        console.log(kleur.dim('  ℹ No core MCP servers configured.'));
        return;
    }

    let added = 0;
    let existing = 0;
    let failed = 0;

    for (const [name, server] of servers) {
        const args = buildProjectMcpArgs(name, server);
        if (!args) continue;

        const r = spawnSync('claude', args, {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (r.status === 0) {
            added++;
            console.log(`${kleur.green('  ✓')} ${name}`);
            continue;
        }

        const stderr = `${r.stderr || ''}`.toLowerCase();
        if (stderr.includes('already exists') || stderr.includes('already configured')) {
            existing++;
            console.log(kleur.dim(`  ✓ ${name} (already configured)`));
            continue;
        }

        failed++;
        console.log(kleur.red(`  ✗ ${name} (${(r.stderr || r.stdout || 'failed').toString().trim()})`));
    }

    console.log(kleur.dim(`  ↳ MCP project-scope result: ${added} added, ${existing} existing, ${failed} failed`));
}

export async function getAvailableProjectSkills(): Promise<string[]> {
    if (!await fs.pathExists(PROJECT_SKILLS_DIR)) {
        return [];
    }

    const entries = await fs.readdir(PROJECT_SKILLS_DIR);
    const skills: string[] = [];

    for (const entry of entries) {
        const entryPath = path.join(PROJECT_SKILLS_DIR, entry);
        const stat = await fs.stat(entryPath);
        if (stat.isDirectory()) {
            skills.push(entry);
        }
    }

    return skills.sort();
}

/**
 * Deep merge settings.json hooks without overwriting existing user hooks.
 * Appends new hooks to existing events intelligently.
 */
export function deepMergeHooks(existing: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
    const result = { ...existing };

    if (!result.hooks) result.hooks = {};
    if (!incoming.hooks) return result;

    for (const [event, incomingHooks] of Object.entries(incoming.hooks)) {
        if (!result.hooks[event]) {
            // Event doesn't exist — add it
            result.hooks[event] = incomingHooks;
        } else {
            // Event exists — merge hooks intelligently
            const existingEventHooks = Array.isArray(result.hooks[event]) ? result.hooks[event] : [result.hooks[event]];
            const incomingEventHooks = Array.isArray(incomingHooks) ? incomingHooks : [incomingHooks];

            const getCommand = (h: any) => h.command || h.hooks?.[0]?.command;
            const mergeMatcher = (existingMatcher: string, incomingMatcher: string): string => {
                const existingParts = existingMatcher.split('|').map((s: string) => s.trim()).filter(Boolean);
                const incomingParts = incomingMatcher.split('|').map((s: string) => s.trim()).filter(Boolean);
                const merged = [...existingParts];
                for (const part of incomingParts) {
                    if (!merged.includes(part)) merged.push(part);
                }
                return merged.join('|');
            };

            const mergedEventHooks = [...existingEventHooks];
            for (const incomingHook of incomingEventHooks) {
                const incomingCmd = getCommand(incomingHook);
                if (!incomingCmd) {
                    mergedEventHooks.push(incomingHook);
                    continue;
                }

                const existingIndex = mergedEventHooks.findIndex((h: any) => getCommand(h) === incomingCmd);
                if (existingIndex === -1) {
                    mergedEventHooks.push(incomingHook);
                    continue;
                }

                const existingHook = mergedEventHooks[existingIndex];
                if (typeof existingHook.matcher === 'string' && typeof incomingHook.matcher === 'string') {
                    existingHook.matcher = mergeMatcher(existingHook.matcher, incomingHook.matcher);
                }
            }

            result.hooks[event] = mergedEventHooks;
        }
    }

    return result;
}

export function extractReadmeDescription(readmeContent: string): string {
    const lines = readmeContent.split('\n');
    const headingIndex = lines.findIndex(line => line.trim().startsWith('# '));
    const searchStart = headingIndex >= 0 ? headingIndex + 1 : 0;

    for (const rawLine of lines.slice(searchStart)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith('[![') || line.startsWith('<')) {
            continue;
        }

        return line
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[*_`]/g, '')
            .trim();
    }

    return 'No description available';
}

/**
 * Install a project skill package into the current project.
 */
export async function installProjectSkill(toolName: string, projectRootOverride?: string): Promise<void> {
    const skillPath = path.join(PROJECT_SKILLS_DIR, toolName);

    // Validation: Check if project skill exists
    if (!await fs.pathExists(skillPath)) {
        console.error(kleur.red(`\n✗ Project skill '${toolName}' not found.\n`));
        console.error(kleur.dim(`  Available project skills:\n`));
        await listProjectSkills();
        process.exit(1);
    }

    // Get target project root
    const projectRoot = projectRootOverride ?? getProjectRoot();
    const claudeDir = path.join(projectRoot, '.claude');

    console.log(kleur.dim(`\n  Installing project skill: ${kleur.cyan(toolName)}`));
    console.log(kleur.dim(`  Target: ${projectRoot}\n`));

    const skillClaudeDir = path.join(skillPath, '.claude');
    const skillSettingsPath = path.join(skillClaudeDir, 'settings.json');
    const skillSkillsDir = path.join(skillClaudeDir, 'skills');
    const skillReadmePath = path.join(skillPath, 'README.md');

    // Step 1: Hook Injection (deep merge settings.json)
    if (await fs.pathExists(skillSettingsPath)) {
        console.log(kleur.bold('── Installing Hooks ──────────────────────'));
        const targetSettingsPath = path.join(claudeDir, 'settings.json');

        await fs.mkdirp(path.dirname(targetSettingsPath));

        let existingSettings: Record<string, any> = {};
        if (await fs.pathExists(targetSettingsPath)) {
            try {
                existingSettings = JSON.parse(await fs.readFile(targetSettingsPath, 'utf8'));
            } catch {
                // malformed JSON — start fresh
            }
        }

        const incomingSettings = JSON.parse(await fs.readFile(skillSettingsPath, 'utf8'));
        const mergedSettings = deepMergeHooks(existingSettings, incomingSettings);

        await fs.writeFile(targetSettingsPath, JSON.stringify(mergedSettings, null, 2) + '\n');
        console.log(`${kleur.green('  ✓')} settings.json (hooks merged)`);
    }

    await syncProjectMcpServers(projectRoot);

    // Step 2: Skill Copy
    if (await fs.pathExists(skillSkillsDir)) {
        console.log(kleur.bold('\n── Installing Skills ─────────────────────'));
        const targetSkillsDir = path.join(claudeDir, 'skills');

        const skillEntries = await fs.readdir(skillSkillsDir);
        for (const entry of skillEntries) {
            const src = path.join(skillSkillsDir, entry);
            const dest = path.join(targetSkillsDir, entry);
            await fs.copy(src, dest, {
                filter: (src: string) => !src.includes('.Zone.Identifier'),
            });
            console.log(`${kleur.green('  ✓')} .claude/skills/${entry}/`);
        }
    }

    // Step 2b: Copy additional Claude assets (hooks, docs, etc.) shipped with the skill
    if (await fs.pathExists(skillClaudeDir)) {
        const claudeEntries = await fs.readdir(skillClaudeDir);

        for (const entry of claudeEntries) {
            if (entry === 'settings.json' || entry === 'skills') {
                continue;
            }

            const src = path.join(skillClaudeDir, entry);
            const dest = path.join(claudeDir, entry);
            await fs.copy(src, dest, {
                filter: (src: string) => !src.includes('.Zone.Identifier'),
            });
            console.log(`${kleur.green('  ✓')} .claude/${entry}/`);
        }
    }

    // Step 3: Documentation Copy
    if (await fs.pathExists(skillReadmePath)) {
        console.log(kleur.bold('\n── Installing Documentation ──────────────'));
        const docsDir = path.join(claudeDir, 'docs');
        await fs.mkdirp(docsDir);

        const destReadme = path.join(docsDir, `${toolName}-readme.md`);
        await fs.copy(skillReadmePath, destReadme);
        console.log(`${kleur.green('  ✓')} .claude/docs/${toolName}-readme.md`);
    }

    // Step 4: Post-Install Guidance
    if (toolName === 'service-skills-set') {
        console.log(kleur.bold('\n── Installing Git Hooks ─────────────────'));
        await installServiceGitHooks(projectRoot, skillClaudeDir);
        console.log(`${kleur.green('  ✓')} .githooks/pre-commit`);
        console.log(`${kleur.green('  ✓')} .githooks/pre-push`);
        console.log(`${kleur.green('  ✓')} activated in .git/hooks/`);
    }

    // Step 5: Post-Install Guidance
    console.log(kleur.bold('\n── Post-Install Steps ────────────────────'));
    console.log(kleur.yellow('\n  ⚠ IMPORTANT: Manual setup required!\n'));
    console.log(kleur.white(`  ${toolName} requires additional configuration.`));
    console.log(kleur.white(`  Please read: ${kleur.cyan('.claude/docs/' + toolName + '-readme.md')}\n`));

    if (toolName === 'tdd-guard') {
        console.log(kleur.white('  Example for Vitest:'));
        console.log(kleur.dim('    npm install --save-dev tdd-guard-vitest\n'));
    }

    console.log(kleur.green('  ✓ Installation complete!\n'));
}

export async function installAllProjectSkills(projectRootOverride?: string): Promise<void> {
    const skills = await getAvailableProjectSkills();

    if (skills.length === 0) {
        console.log(kleur.dim('  No project skills available.\n'));
        return;
    }

    const projectRoot = projectRootOverride ?? getProjectRoot();

    console.log(kleur.bold(`\nInstalling ${skills.length} project skills:\n`));
    for (const skill of skills) {
        console.log(kleur.dim(`  • ${skill}`));
    }
    console.log('');

    for (const skill of skills) {
        await installProjectSkill(skill, projectRoot);
    }
}

export function buildProjectInitGuide(): string {
    const lines = [
        kleur.bold('\nProject Init — Recommended baseline\n'),
        `${kleur.cyan('1) Install a quality gate skill (or equivalent checks):')}`,
        kleur.dim('   - TypeScript projects: xtrm install project ts-quality-gate'),
        kleur.dim('   - Python projects:     xtrm install project py-quality-gate'),
        kleur.dim('   - TDD workflow:        xtrm install project tdd-guard'),
        '',
        `${kleur.cyan('2) Ensure your checks are actually configured in this repo:')}`,
        kleur.dim('   - Testing: commands should run and fail when behavior regresses'),
        kleur.dim('   - Linting/formatting: ESLint+Prettier (TS) or ruff (Python)'),
        kleur.dim('   - Type checks: tsc (TS) or mypy/pyright (Python)'),
        kleur.dim('   - Hooks only enforce what your project config defines'),
        '',
        `${kleur.cyan('3) Optional: Service Skills Set (service-skills-set)')}`,
        kleur.dim('   - For multi-service/Docker repos with repeated operational workflows'),
        kleur.dim('   - Adds project hooks + skills that route Claude to service-specific context'),
        kleur.dim('   - Helps keep architecture knowledge persistent across sessions'),
        '',
        kleur.bold('Quick start commands:'),
        kleur.dim('   xtrm install project list'),
        kleur.dim('   xtrm install project ts-quality-gate   # or py-quality-gate / tdd-guard'),
        '',
    ];

    return lines.join('\n');
}

async function printProjectInitGuide(): Promise<void> {
    console.log(buildProjectInitGuide());
    await runBdInitForProject();
}

async function installProjectByName(toolName: string): Promise<void> {
    if (toolName === 'all' || toolName === '*') {
        await installAllProjectSkills();
        return;
    }
    await installProjectSkill(toolName);
}

async function runBdInitForProject(): Promise<void> {
    let projectRoot: string;
    try {
        projectRoot = getProjectRoot();
    } catch (err: any) {
        console.log(kleur.yellow(`\n  ⚠ Skipping bd init: ${err.message}\n`));
        return;
    }

    console.log(kleur.bold('Running beads initialization (bd init)...'));

    const result = spawnSync('bd', ['init'], {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 15000,
    });

    if (result.error) {
        console.log(kleur.yellow(`  ⚠ Could not run bd init (${result.error.message})`));
        return;
    }

    if (result.status !== 0) {
        const text = `${result.stdout || ''}\n${result.stderr || ''}`.toLowerCase();
        if (text.includes('already initialized')) {
            console.log(kleur.dim('  ✓ beads workspace already initialized'));
            return;
        }
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        console.log(kleur.yellow(`  ⚠ bd init exited with code ${result.status}`));
        return;
    }

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
}

/**
 * List available project skills.
 */
async function listProjectSkills(): Promise<void> {
    const entries = await getAvailableProjectSkills();
    if (entries.length === 0) {
        console.log(kleur.dim('  No project skills available.\n'));
        return;
    }

    const skills: Array<{ name: string; description: string }> = [];

    for (const entry of entries) {
        const readmePath = path.join(PROJECT_SKILLS_DIR, entry, 'README.md');
        let description = 'No description available';

        if (await fs.pathExists(readmePath)) {
            const readmeContent = await fs.readFile(readmePath, 'utf8');
            description = extractReadmeDescription(readmeContent).slice(0, 80);
        }

        skills.push({ name: entry, description });
    }

    if (skills.length === 0) {
        console.log(kleur.dim('  No project skills available.\n'));
        return;
    }

    console.log(kleur.bold('\nAvailable Project Skills:\n'));

    // Dynamic import for Table
    const Table = require('cli-table3');
    const table = new Table({
        head: [kleur.cyan('Skill'), kleur.cyan('Description')],
        colWidths: [25, 60],
        style: { head: [], border: [] },
    });

    for (const skill of skills) {
        table.push([kleur.white(skill.name), kleur.dim(skill.description)]);
    }

    console.log(table.toString());

    console.log(kleur.bold('\n\nUsage:\n'));
    console.log(kleur.dim('  xtrm install project <skill-name>   Install a project skill'));
    console.log(kleur.dim('  xtrm install project all            Install all project skills'));
    console.log(kleur.dim('  xtrm install project list           List available skills\n'));

    console.log(kleur.bold('Example:\n'));
    console.log(kleur.dim('  xtrm install project tdd-guard\n'));
}

function getProjectRoot(): string {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        timeout: 5000,
    });
    if (result.status !== 0) {
        throw new Error('Not inside a git repository. Run this command from your target project directory.');
    }
    return path.resolve(result.stdout.trim());
}

export function createInstallProjectCommand(): Command {
    const installProjectCmd = new Command('project')
        .description('Install a project-specific skill package');

    // Subcommand: install project <tool-name>
    installProjectCmd
        .argument('<tool-name>', 'Name of the project skill to install')
        .action(async (toolName: string) => {
            try {
                await installProjectByName(toolName);
            } catch (err: any) {
                console.error(kleur.red(`\n✗ ${err.message}\n`));
                process.exit(1);
            }
        });

    // Subcommand: install project list
    const listCmd = new Command('list')
        .description('List available project skills')
        .action(async () => {
            await listProjectSkills();
        });

    const initCmd = new Command('init')
        .description('Show project onboarding guidance (quality gates + service skills)')
        .action(async () => {
            await printProjectInitGuide();
        });

    installProjectCmd.addCommand(listCmd);
    installProjectCmd.addCommand(initCmd);

    return installProjectCmd;
}

export function createProjectCommand(): Command {
    const projectCmd = new Command('project')
        .description('Project skill onboarding and installation helpers');

    projectCmd
        .command('init')
        .description('Show project onboarding guidance (quality gates + service skills)')
        .action(async () => {
            await printProjectInitGuide();
        });

    projectCmd
        .command('list')
        .description('List available project skills')
        .action(async () => {
            await listProjectSkills();
        });

    projectCmd
        .command('install')
        .argument('<tool-name>', 'Name of the project skill to install')
        .description('Alias for xtrm install project <tool-name>')
        .action(async (toolName: string) => {
            try {
                await installProjectByName(toolName);
            } catch (err: any) {
                console.error(kleur.red(`\n✗ ${err.message}\n`));
                process.exit(1);
            }
        });

    return projectCmd;
}
