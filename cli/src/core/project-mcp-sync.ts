import fs from 'fs-extra';
import path from 'node:path';

const CORE_MCP_CONFIG_FILE = 'claude.mcp.json';
const PI_CORE_MCP_CONFIG_FILE = 'pi.mcp.json';
const PROJECT_MCP_FILE = '.mcp.json';
const PI_PROJECT_MCP_FILE = path.join('.pi', 'mcp.json');

interface McpServerMap {
    [serverName: string]: Record<string, unknown>;
}

interface McpConfigFile {
    mcpServers?: McpServerMap;
}

interface McpProjectConfig {
    mcpServers: McpServerMap;
    [key: string]: unknown;
}

export interface SyncProjectMcpOptions {
    dryRun?: boolean;
    preserveExistingFile?: boolean;
}

export interface SyncProjectMcpResult {
    addedServers: string[];
    missingEnvWarnings: string[];
    wroteFile: boolean;
    createdFile: boolean;
    preservedExistingFile: boolean;
    mcpPath: string;
}

function sanitizeServerConfig(server: Record<string, unknown>): Record<string, unknown> {
    const entries = Object.entries(server).filter(([key]) => !key.startsWith('_'));
    return Object.fromEntries(entries);
}

function readMcpServers(config: McpConfigFile): McpServerMap {
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        return {};
    }

    return Object.entries(config.mcpServers).reduce<McpServerMap>((acc, [name, value]) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return acc;
        }
        acc[name] = sanitizeServerConfig(value as Record<string, unknown>);
        return acc;
    }, {});
}

function mergeCanonicalServers(core: McpServerMap, optional: McpServerMap): McpServerMap {
    const merged: McpServerMap = { ...core };

    for (const [name, server] of Object.entries(optional)) {
        if (!(name in merged)) {
            merged[name] = server;
        }
    }

    return merged;
}

function extractEnvVarNames(value: unknown): string[] {
    if (typeof value === 'string') {
        const matches = value.matchAll(/\$\{([A-Z0-9_]+)\}/g);
        return Array.from(matches, (match) => match[1]);
    }

    if (Array.isArray(value)) {
        return value.flatMap((item) => extractEnvVarNames(item));
    }

    if (value && typeof value === 'object') {
        return Object.values(value).flatMap((item) => extractEnvVarNames(item));
    }

    return [];
}

function getMissingEnvWarnings(servers: McpServerMap): string[] {
    const warnings: string[] = [];

    for (const [name, config] of Object.entries(servers)) {
        const requiredVars = Array.from(new Set(extractEnvVarNames(config)));
        const missingVars = requiredVars.filter((envName) => !process.env[envName]);

        if (missingVars.length === 0) continue;

        warnings.push(`${name}: missing ${missingVars.join(', ')}`);
    }

    return warnings;
}

export async function syncProjectMcpConfig(projectRoot: string, options: SyncProjectMcpOptions = {}): Promise<SyncProjectMcpResult> {
    const { dryRun = false, preserveExistingFile = false } = options;
    const xtrmConfigDir = path.join(projectRoot, '.xtrm', 'config');
    const coreConfigPath = path.join(xtrmConfigDir, CORE_MCP_CONFIG_FILE);
    const targetMcpPath = path.join(projectRoot, PROJECT_MCP_FILE);

    if (!await fs.pathExists(coreConfigPath)) {
        return {
            addedServers: [],
            missingEnvWarnings: [`canonical MCP config not found at ${coreConfigPath}`],
            wroteFile: false,
            createdFile: false,
            preservedExistingFile: false,
            mcpPath: targetMcpPath,
        };
    }

    const coreConfig = await fs.readJson(coreConfigPath) as McpConfigFile;
    // Optional servers are not merged by default — they pollute context.
    // Users can manually add them to .mcp.json if needed.
    const optionalConfig: McpConfigFile = { mcpServers: {} };

    const canonicalServers = mergeCanonicalServers(readMcpServers(coreConfig), readMcpServers(optionalConfig));

    const hasExistingMcp = await fs.pathExists(targetMcpPath);
    if (hasExistingMcp && preserveExistingFile) {
        return {
            addedServers: [],
            missingEnvWarnings: [],
            wroteFile: false,
            createdFile: false,
            preservedExistingFile: true,
            mcpPath: targetMcpPath,
        };
    }

    const missingEnvWarnings = getMissingEnvWarnings(canonicalServers);
    const existingConfig = hasExistingMcp
        ? (await fs.readJson(targetMcpPath) as Partial<McpProjectConfig>)
        : {};

    const existingServers = existingConfig.mcpServers && typeof existingConfig.mcpServers === 'object'
        ? existingConfig.mcpServers
        : {};

    const addedServers = Object.keys(canonicalServers).filter((name) => !(name in existingServers));
    const mergedServers: McpServerMap = {
        ...canonicalServers,
        ...existingServers,
    };

    const mergedConfig: McpProjectConfig = {
        ...existingConfig,
        mcpServers: mergedServers,
    } as McpProjectConfig;

    const wroteFile = addedServers.length > 0 || !hasExistingMcp;

    if (!dryRun && wroteFile) {
        await fs.writeJson(targetMcpPath, mergedConfig, { spaces: 2 });
    }

    return {
        addedServers,
        missingEnvWarnings,
        wroteFile,
        createdFile: !hasExistingMcp,
        preservedExistingFile: false,
        mcpPath: targetMcpPath,
    };
}

export async function syncPiMcpConfig(projectRoot: string, options: SyncProjectMcpOptions = {}): Promise<SyncProjectMcpResult> {
    const { dryRun = false } = options;
    const xtrmConfigDir = path.join(projectRoot, '.xtrm', 'config');
    const coreConfigPath = path.join(xtrmConfigDir, PI_CORE_MCP_CONFIG_FILE);
    const targetMcpPath = path.join(projectRoot, PI_PROJECT_MCP_FILE);

    if (!await fs.pathExists(coreConfigPath)) {
        return {
            addedServers: [],
            missingEnvWarnings: [`canonical MCP config not found at ${coreConfigPath}`],
            wroteFile: false,
            createdFile: false,
            preservedExistingFile: false,
            mcpPath: targetMcpPath,
        };
    }

    const coreConfig = await fs.readJson(coreConfigPath) as McpConfigFile;
    const canonicalServers = readMcpServers(coreConfig);
    const missingEnvWarnings = getMissingEnvWarnings(canonicalServers);

    const hasExistingMcp = await fs.pathExists(targetMcpPath);
    const existingConfig = hasExistingMcp
        ? (await fs.readJson(targetMcpPath) as Partial<McpProjectConfig>)
        : {};

    const existingServers = existingConfig.mcpServers && typeof existingConfig.mcpServers === 'object'
        ? existingConfig.mcpServers
        : {};

    const addedServers = Object.keys(canonicalServers).filter((name) => !(name in existingServers));
    const mergedServers: McpServerMap = {
        ...canonicalServers,
        ...existingServers,
    };

    const mergedConfig: McpProjectConfig = {
        ...existingConfig,
        mcpServers: mergedServers,
    } as McpProjectConfig;

    const wroteFile = addedServers.length > 0 || !hasExistingMcp;

    if (!dryRun && wroteFile) {
        await fs.ensureDir(path.dirname(targetMcpPath));
        await fs.writeJson(targetMcpPath, mergedConfig, { spaces: 2 });
    }

    return {
        addedServers,
        missingEnvWarnings,
        wroteFile,
        createdFile: !hasExistingMcp,
        preservedExistingFile: false,
        mcpPath: targetMcpPath,
    };
}
