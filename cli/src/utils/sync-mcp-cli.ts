import { execSync, exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import fs from 'fs-extra';
import path from 'path';
import kleur from 'kleur';
// @ts-ignore
import ora from 'ora';
import { ensureEnvFile, loadEnvFile, checkRequiredEnvVars, handleMissingEnvVars, getEnvFilePath } from './env-manager.js';

export type AgentName = 'claude' | 'gemini' | 'qwen';

interface AgentCLI {
    command: string;
    listArgs: string[];
    addStdio: (name: string, cmd: string, args?: string[], env?: Record<string, string>) => string[];
    addHttp: (name: string, url: string, headers?: Record<string, string>) => string[];
    addSse: (name: string, url: string) => string[];
    remove: (name: string) => string[];
    parseList: (output: string) => string[];
}

const AGENT_CLI: Record<AgentName, AgentCLI> = {
    claude: {
        command: 'claude',
        listArgs: ['mcp', 'list'],
        addStdio: (name, cmd, args, env) => {
            const base = ['mcp', 'add', '-s', 'user', name, '--'];
            if (env && Object.keys(env).length > 0) {
                for (const [key, value] of Object.entries(env)) {
                    base.push('-e', `${key}=${resolveEnvVar(value)}`);
                }
            }
            base.push(cmd, ...(args || []));
            return base;
        },
        addHttp: (name, url, headers) => {
            const base = ['mcp', 'add', '-s', 'user', '--transport', 'http', name, url];
            if (headers) {
                for (const [key, value] of Object.entries(headers)) {
                    base.push('--header', `${key}: ${resolveEnvVar(value)}`);
                }
            }
            return base;
        },
        addSse: (name, url) => {
            return ['mcp', 'add', '-s', 'user', '--transport', 'sse', name, url];
        },
        remove: (name) => ['mcp', 'remove', '-s', 'user', name],
        parseList: (output) => parseMcpListOutput(output, /^([a-zA-Z0-9_-]+):/)
    },
    gemini: {
        command: 'gemini',
        listArgs: ['mcp', 'list'], // list doesn't support -s flag, lists all scopes
        addStdio: (name, cmd, args, env) => {
            const base = ['mcp', 'add', '-s', 'user', name, cmd];
            if (args && args.length > 0) base.push(...args);
            if (env && Object.keys(env).length > 0) {
                for (const [key, value] of Object.entries(env)) {
                    base.push('-e', `${key}=${resolveEnvVar(value)}`);
                }
            }
            return base;
        },
        addHttp: (name, url, headers) => {
            const base = ['mcp', 'add', '-s', 'user', '-t', 'http', name, url];
            if (headers) {
                for (const [key, value] of Object.entries(headers)) {
                    base.push('-H', `${key}=${resolveEnvVar(value)}`);
                }
            }
            return base;
        },
        addSse: (name, url) => {
            return ['mcp', 'add', '-s', 'user', '-t', 'sse', name, url];
        },
        remove: (name) => ['mcp', 'remove', '-s', 'user', name],
        parseList: (output) => parseMcpListOutput(output, /^✓ ([a-zA-Z0-9_-]+):/)
    },
    qwen: {
        command: 'qwen',
        listArgs: ['mcp', 'list'],
        addStdio: (name, cmd, args, env) => {
            const base = ['mcp', 'add', '-s', 'user', name, cmd];
            if (args && args.length > 0) base.push(...args);
            if (env && Object.keys(env).length > 0) {
                for (const [key, value] of Object.entries(env)) {
                    base.push('-e', `${key}=${resolveEnvVar(value)}`);
                }
            }
            return base;
        },
        addHttp: (name, url, headers) => {
            const base = ['mcp', 'add', '-s', 'user', '-t', 'http', name, url];
            if (headers) {
                for (const [key, value] of Object.entries(headers)) {
                    base.push('-H', `${key}=${resolveEnvVar(value)}`);
                }
            }
            return base;
        },
        addSse: (name, url) => {
            return ['mcp', 'add', '-s', 'user', '-t', 'sse', name, url];
        },
        remove: (name) => ['mcp', 'remove', '-s', 'user', name],
        parseList: (output) => parseMcpListOutput(output, /^✓ ([a-zA-Z0-9_-]+):/)
    }
};

// Strip ANSI escape codes (e.g. qwen wraps ✓ in color codes)
function stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function parseMcpListOutput(output: string, pattern: RegExp): string[] {
    const servers: string[] = [];
    for (const line of output.split('\n')) {
        const match = stripAnsi(line).match(pattern);
        if (match) {
            servers.push(match[1]);
        }
    }
    return servers;
}

function resolveEnvVar(value: string): string {
    if (typeof value !== 'string') return value;

    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, envName) => {
        const upperName = envName.toUpperCase();
        const envValue = process.env[upperName];
        if (envValue) {
            return envValue;
        } else {
            console.warn(kleur.yellow(`  ⚠️  Environment variable ${upperName} is not set in ${getEnvFilePath()}`));
            return '';
        }
    });
}

export function detectAgent(systemRoot: string): AgentName | null {
    const normalizedRoot = systemRoot.replace(/\\/g, '/').toLowerCase();
    if (normalizedRoot.includes('.claude') || normalizedRoot.includes('/claude')) {
        return 'claude';
    } else if (normalizedRoot.includes('.gemini') || normalizedRoot.includes('/gemini')) {
        return 'gemini';
    } else if (normalizedRoot.includes('.qwen') || normalizedRoot.includes('/qwen')) {
        return 'qwen';
    }
    return null;
}

function buildAddCommand(agent: AgentName, name: string, server: any): string[] | null {
    const cli = AGENT_CLI[agent];
    if (!cli) return null;

    if (server.url || server.serverUrl) {
        const url = server.url || server.serverUrl;
        const type = server.type || (url.includes('/sse') ? 'sse' : 'http');

        if (type === 'sse') {
            return cli.addSse(name, url);
        } else {
            return cli.addHttp(name, url, server.headers);
        }
    }

    if (server.command) {
        return cli.addStdio(name, server.command, server.args, server.env);
    }

    console.warn(kleur.yellow(`  ⚠️  Skipping server "${name}": Unknown configuration`));
    return null;
}

interface CommandResult {
    success: boolean;
    dryRun?: boolean;
    skipped?: boolean;
    error?: string;
}

function executeCommand(agent: AgentName, args: string[], dryRun: boolean = false, displayName?: string): CommandResult {
    const cli = AGENT_CLI[agent];

    const quotedArgs = args.map(arg => {
        if (arg.includes(' ') && !arg.startsWith('"') && !arg.startsWith("'")) {
            return `"${arg}"`;
        }
        return arg;
    });
    const command = `${cli.command} ${quotedArgs.join(' ')}`;

    if (dryRun) {
        console.log(kleur.cyan(`  [DRY RUN] ${displayName ?? args.slice(2).join(' ')}`));
        return { success: true, dryRun: true };
    }

    try {
        execSync(command, { stdio: 'pipe', timeout: 10000 });
        console.log(kleur.green(`  ✓ ${displayName ?? args.slice(2).join(' ')}`));
        return { success: true };
    } catch (error: any) {
        const stderr = error.stderr?.toString() || error.message;

        if (stderr.includes('already exists') || stderr.includes('already configured')) {
            let serverName = 'unknown';
            if (agent === 'claude') {
                const addIndex = args.indexOf('add');
                for (let i = addIndex + 1; i < args.length; i++) {
                    const arg = args[i];
                    if (arg === '--') continue;
                    if (arg.startsWith('-')) continue;
                    if (['local', 'user', 'project', 'http', 'sse', 'stdio'].includes(arg)) continue;
                    serverName = arg;
                    break;
                }
            } else if (agent === 'gemini' || agent === 'qwen') {
                const addIndex = args.indexOf('add');
                for (let i = addIndex + 1; i < args.length; i++) {
                    const arg = args[i];
                    if (arg === '-t') { i++; continue; }
                    if (arg.startsWith('-')) continue;
                    if (['http', 'sse', 'stdio'].includes(arg)) continue;
                    serverName = arg;
                    break;
                }
            } else {
                serverName = args[2];
            }
            console.log(kleur.dim(`  ✓ ${serverName} (already configured)`));
            return { success: true, skipped: true };
        }

        console.log(kleur.red(`  ✗ Failed: ${stderr.trim()}`));
        return { success: false, error: stderr };
    }
}

export function getCurrentServers(agent: AgentName): string[] {
    const cli = AGENT_CLI[agent];
    try {
        const output = execSync(`${cli.command} ${cli.listArgs.join(' ')}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return cli.parseList(output);
    } catch (error: any) {
        // Some CLIs (e.g. gemini) write server list to stderr
        const combined = (error.stdout || '') + '\n' + (error.stderr || '');
        return cli.parseList(combined);
    }
}

export async function getCurrentServersAsync(agent: AgentName): Promise<string[]> {
    const cli = AGENT_CLI[agent];
    try {
        const { stdout, stderr } = await execAsync(`${cli.command} ${cli.listArgs.join(' ')}`, {
            timeout: 10000,
        });
        // Some CLIs (e.g. gemini) write server list to stderr
        return cli.parseList(stdout + '\n' + stderr);
    } catch (error) {
        return [];
    }
}

/**
 * Extract ${VAR_NAME} references from a list of server config objects
 */
function getServerEnvVarNames(servers: any[]): string[] {
    const vars = new Set<string>();
    const pattern = /\$\{([A-Z0-9_]+)\}/g;
    for (const server of servers) {
        const json = JSON.stringify(server);
        let match;
        const re = new RegExp(pattern.source, pattern.flags);
        while ((match = re.exec(json)) !== null) {
            vars.add(match[1]);
        }
    }
    return Array.from(vars);
}

/**
 * Sync MCP servers to an agent using official CLI
 */
// Prevents ensureEnvFile/loadEnvFile from firing once per target directory
let envInitialized = false;

export async function syncMcpServersWithCli(
    agent: AgentName,
    mcpConfig: any,
    dryRun: boolean = false,
    prune: boolean = false
): Promise<void> {
    const cli = AGENT_CLI[agent];
    if (!cli) {
        console.log(kleur.yellow(`  ⚠️  Unsupported agent: ${agent}`));
        return;
    }

    if (!envInitialized) {
        ensureEnvFile();
        loadEnvFile();
        envInitialized = true;
    }

    const spinner = ora({ text: kleur.dim('  checking installed servers…'), indent: 2 }).start();
    const currentServers = await getCurrentServersAsync(agent);
    spinner.stop();
    const currentServersSet = new Set(currentServers);
    const canonicalServers = new Set(Object.keys(mcpConfig.mcpServers || {}));

    if (prune) {
        const toRemove = currentServers.filter(s => !canonicalServers.has(s));
        if (toRemove.length > 0) {
            console.log(kleur.red(`  Pruning ${toRemove.length} server(s)...`));
            for (const serverName of toRemove) {
                executeCommand(agent, cli.remove(serverName), dryRun);
            }
        }
    }

    // Determine which servers actually need to be added
    const toAdd = Object.entries(mcpConfig.mcpServers || {}).filter(([name]) => !currentServersSet.has(name));
    const skippedCount = canonicalServers.size - toAdd.length;

    if (toAdd.length === 0) {
        // Nothing to add — skip env warning, no CLI calls needed
        console.log(kleur.dim(`  ✓ ${skippedCount} server(s) already installed`));
        return;
    }

    // Step 1: Multiselect — all servers pre-selected, user can deselect with space
    let selectedNames: string[] = toAdd.map(([name]) => name);

    if (!dryRun) {
        // @ts-ignore
        const prompts = await import('prompts');
        const { selected } = await prompts.default({
            type: 'multiselect',
            name: 'selected',
            message: `Select MCP servers to install via ${agent} CLI:`,
            choices: toAdd.map(([name, server]: [string, any]) => ({
                title: name,
                description: (server as any)._notes?.description || '',
                value: name,
                selected: true
            })),
            hint: '- Space to toggle. Enter to confirm.',
            instructions: false
        });

        if (!selected || selected.length === 0) {
            console.log(kleur.gray('  Skipped MCP installation.'));
            return;
        }

        selectedNames = selected;

        // Step 2: Only ask for env vars needed by the selected servers
        const selectedEntries = toAdd.filter(([name]) => new Set(selectedNames).has(name));
        const neededVarNames = getServerEnvVarNames(selectedEntries.map(([, s]) => s as any));
        const missingEnvVars = checkRequiredEnvVars(neededVarNames);
        if (missingEnvVars.length > 0) {
            const shouldProceed = await handleMissingEnvVars(missingEnvVars);
            if (!shouldProceed) return;
        }
    }

    // Step 3: Build and execute commands for selected servers only
    const selectedSet = new Set(selectedNames);
    const commandsToRun: Array<{ name: string; cmd: string[] }> = [];
    for (const [name, server] of toAdd) {
        if (!selectedSet.has(name)) continue;
        const cmd = buildAddCommand(agent, name, server as any);
        if (cmd) commandsToRun.push({ name, cmd });
    }

    if (commandsToRun.length === 0) return;

    let successCount = 0;
    for (const { name, cmd } of commandsToRun) {
        const result = executeCommand(agent, cmd, dryRun, name);
        if (result.success && !result.skipped) {
            successCount++;
        }
    }

    if (skippedCount > 0) {
        console.log(kleur.dim(`  ✓ ${skippedCount} already installed, ${successCount} added`));
    } else {
        console.log(kleur.green(`  ✓ ${successCount} server(s) added`));
    }
}

/**
 * Load canonical MCP config from repository
 */
export function loadCanonicalMcpConfig(repoRoot: string, includeOptional: boolean = false): any {
    const corePath = path.join(repoRoot, 'config', 'mcp_servers.json');
    const optionalPath = path.join(repoRoot, 'config', 'mcp_servers_optional.json');

    const config: any = { mcpServers: {} };

    if (fs.existsSync(corePath)) {
        const core = fs.readJsonSync(corePath);
        config.mcpServers = { ...config.mcpServers, ...core.mcpServers };
    }

    if (includeOptional && fs.existsSync(optionalPath)) {
        const optional = fs.readJsonSync(optionalPath);
        config.mcpServers = { ...config.mcpServers, ...optional.mcpServers };
    }

    return config;
}

/**
 * Prompt user to select optional MCP servers
 */
export async function promptOptionalServers(repoRoot: string): Promise<string[] | false> {
    const optionalPath = path.join(repoRoot, 'config', 'mcp_servers_optional.json');

    if (!fs.existsSync(optionalPath)) {
        return false;
    }

    const optional = fs.readJsonSync(optionalPath);
    const servers = Object.entries(optional.mcpServers || {}).map(([name, server]: [string, any]) => ({
        name,
        description: server._notes?.description || 'No description',
        prerequisite: server._notes?.prerequisite || ''
    }));

    if (servers.length === 0) {
        return false;
    }

    // @ts-ignore
    const prompts = await import('prompts');

    const { selected } = await prompts.default({
        type: 'multiselect',
        name: 'selected',
        message: 'Optional MCP servers available — select to install (space to toggle, enter to confirm):',
        choices: servers.map(s => ({
            title: s.name,
            description: s.prerequisite
                ? `${s.description} — ⚠️  ${s.prerequisite}`
                : s.description,
            value: s.name,
            selected: false
        })),
        hint: '- Space to select. Enter to skip or confirm.',
        instructions: false
    });

    if (!selected || selected.length === 0) {
        console.log(kleur.gray('  Skipping optional servers.\n'));
        return false;
    }

    console.log(kleur.green(`  Selected: ${selected.join(', ')}\n`));
    return selected;
}
