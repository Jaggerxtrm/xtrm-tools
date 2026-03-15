import { randomUUID } from 'node:crypto';
import fs from 'fs-extra';
// @ts-ignore
import { parse, stringify } from 'comment-json';

/**
 * Atomic Configuration Handler with Vault Pattern
 * Ensures safe read/write operations with protection against corruption during crashes
 */

// Protected keys that should never be overwritten if they exist locally
const PROTECTED_KEYS = [
    'permissions.allow',       // User-defined permissions
    'hooks.UserPromptSubmit',  // Claude hooks
    'hooks.SessionStart',
    'hooks.PreToolUse',
    'hooks.BeforeAgent',       // Gemini hooks
    'hooks.BeforeTool',        // Gemini hooks
    'security',                // Auth secrets/OAuth data
    'general',                 // Personal preferences
    'enabledPlugins',          // User-enabled/disabled plugins
    'model',                   // User's preferred model
    'skillSuggestions.enabled' // User preferences
];

/**
 * Check if a key path is exactly protected or a parent of a protected key
 */
export function isProtectedPath(keyPath: string): boolean {
    return PROTECTED_KEYS.some(protectedPath =>
        keyPath === protectedPath || protectedPath.startsWith(keyPath + '.')
    );
}

/**
 * Check if a key path is a protected key or a child of a protected key
 */
export function isValueProtected(keyPath: string): boolean {
    return PROTECTED_KEYS.some(protectedPath =>
        keyPath === protectedPath || keyPath.startsWith(protectedPath + '.')
    );
}

function extractHookCommands(wrapper: any): string[] {
    if (!wrapper || !Array.isArray(wrapper.hooks)) return [];
    return wrapper.hooks
        .map((h: any) => h?.command)
        .filter((c: any): c is string => typeof c === 'string' && c.trim().length > 0);
}

function commandKey(command: string): string {
    const m = command.match(/([A-Za-z0-9._-]+\.(?:py|cjs|mjs|js))(?!.*[A-Za-z0-9._-]+\.(?:py|cjs|mjs|js))/);
    return m?.[1] || command.trim();
}

function mergeMatcher(existingMatcher: string, incomingMatcher: string): string {
    const parts = [
        ...existingMatcher.split('|').map((s: string) => s.trim()),
        ...incomingMatcher.split('|').map((s: string) => s.trim()),
    ].filter(Boolean);
    return Array.from(new Set(parts)).join('|');
}

function mergeHookWrappers(existing: any[], incoming: any[]): any[] {
    const merged = existing.map((w: any) => ({ ...w }));

    for (const incomingWrapper of incoming) {
        const incomingCommands = extractHookCommands(incomingWrapper);
        if (incomingCommands.length === 0) {
            merged.push(incomingWrapper);
            continue;
        }

        const incomingKeys = new Set(incomingCommands.map(commandKey));
        const existingIndex = merged.findIndex((existingWrapper: any) => {
            const existingCommands = extractHookCommands(existingWrapper);
            return existingCommands.some((c: string) => incomingKeys.has(commandKey(c)));
        });

        if (existingIndex === -1) {
            merged.push(incomingWrapper);
            continue;
        }

        const existingWrapper = merged[existingIndex];
        if (
            typeof existingWrapper.matcher === 'string' &&
            typeof incomingWrapper.matcher === 'string'
        ) {
            existingWrapper.matcher = mergeMatcher(existingWrapper.matcher, incomingWrapper.matcher);
        }

        if (Array.isArray(existingWrapper.hooks) && Array.isArray(incomingWrapper.hooks)) {
            const existingByKey = new Set(existingWrapper.hooks
                .map((h: any) => h?.command)
                .filter((c: any): c is string => typeof c === 'string')
                .map(commandKey));
            for (const hook of incomingWrapper.hooks) {
                const cmd = hook?.command;
                if (typeof cmd !== 'string' || !existingByKey.has(commandKey(cmd))) {
                    existingWrapper.hooks.push(hook);
                }
            }
        }
    }

    return merged;
}

function mergeHooksObject(existingHooks: any, incomingHooks: any): any {
    const result = { ...(existingHooks || {}) };
    for (const [event, incomingWrappers] of Object.entries(incomingHooks || {})) {
        const existingWrappers = Array.isArray(result[event]) ? result[event] : [];
        const incomingArray = Array.isArray(incomingWrappers) ? incomingWrappers : [];
        result[event] = mergeHookWrappers(existingWrappers, incomingArray);
    }
    return result;
}

/**
 * Deep merge two objects, preserving protected values from the original
 */
export function deepMergeWithProtection(original: any, updates: any, currentPath: string = ''): any {
    const result = { ...original };

    for (const [key, value] of Object.entries(updates)) {
        const keyPath = currentPath ? `${currentPath}.${key}` : key;

        // Hooks are canonical but should still preserve local custom entries.
        // Merge by command identity and upgrade matchers for overlapping hooks.
        if (
            key === 'hooks' &&
            typeof value === 'object' &&
            value !== null &&
            typeof original[key] === 'object' &&
            original[key] !== null
        ) {
            result[key] = mergeHooksObject(original[key], value);
            continue;
        }

        // If this specific value is protected and exists locally, skip it
        if (isValueProtected(keyPath) && original.hasOwnProperty(key)) {
            continue;
        }

        // Special handling for mcpServers: merge individual server entries
        if (key === 'mcpServers' && typeof value === 'object' && value !== null &&
            typeof original[key] === 'object' && original[key] !== null) {

            result[key] = { ...original[key] }; // Start with original servers

            // Add servers from updates that don't exist in original
            for (const [serverName, serverConfig] of Object.entries(value)) {
                if (!result[key].hasOwnProperty(serverName)) {
                    result[key][serverName] = serverConfig;
                }
            }
        } else if (
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            typeof original[key] === 'object' &&
            original[key] !== null &&
            !Array.isArray(original[key])
        ) {
            // Recursively merge nested objects
            result[key] = deepMergeWithProtection(original[key], value, keyPath);
        } else {
            // Overwrite with new value for non-protected keys
            result[key] = value;
        }
    }

    return result;
}

interface AtomicWriteOptions {
    preserveComments?: boolean;
    backupOnSuccess?: boolean;
    backupSuffix?: string;
}

/**
 * Atomically write data to a file using a temporary file
 */
export async function atomicWrite(filePath: string, data: any, options: AtomicWriteOptions = {}): Promise<void> {
    const {
        preserveComments = false,
        backupOnSuccess = false,
        backupSuffix = '.bak'
    } = options;

    const tempFilePath = `${filePath}.tmp.${randomUUID()}`;

    try {
        let content: string;
        if (preserveComments) {
            content = stringify(data, null, 2);
        } else {
            content = JSON.stringify(data, null, 2);
        }

        await fs.writeFile(tempFilePath, content, 'utf8');

        const tempStats = await fs.stat(tempFilePath);
        if (tempStats.size === 0) {
            throw new Error('Temporary file is empty - write failed');
        }

        if (backupOnSuccess && await fs.pathExists(filePath)) {
            const backupPath = `${filePath}${backupSuffix}`;
            await fs.copy(filePath, backupPath);
        }

        await fs.rename(tempFilePath, filePath);
    } catch (error) {
        try {
            if (await fs.pathExists(tempFilePath)) {
                await fs.unlink(tempFilePath);
            }
        } catch (cleanupError) { }
        throw error;
    }
}

/**
 * Safely read a JSON configuration file with error handling
 */
export async function safeReadConfig(filePath: string): Promise<any> {
    try {
        if (!(await fs.pathExists(filePath))) {
            return {};
        }

        const content = await fs.readFile(filePath, 'utf8');

        try {
            return parse(content);
        } catch (parseError) {
            return JSON.parse(content);
        }
    } catch (error: any) {
        if (error.code === 'ENOENT') return {};
        throw new Error(`Failed to read config file: ${error.message}`);
    }
}

interface MergeOptions {
    preserveComments?: boolean;
    backupOnSuccess?: boolean;
    dryRun?: boolean;
    resolvedLocalConfig?: any;
}

export interface MergeResult {
    updated: boolean;
    changes: string[];
}

/**
 * Perform a safe merge of repository config with local config
 */
export async function safeMergeConfig(localConfigPath: string, repoConfig: any, options: MergeOptions = {}): Promise<MergeResult> {
    const {
        preserveComments = true,
        backupOnSuccess = true,
        dryRun = false,
        resolvedLocalConfig = null
    } = options;

    const localConfig = resolvedLocalConfig || await safeReadConfig(localConfigPath);
    const changes: string[] = [];

    if (localConfig.mcpServers && typeof localConfig.mcpServers === 'object') {
        const localServerNames = Object.keys(localConfig.mcpServers);
        if (localServerNames.length > 0) {
            changes.push(`Preserved ${localServerNames.length} local mcpServers: ${localServerNames.join(', ')}`);
        }
    }

    if (repoConfig.mcpServers && typeof repoConfig.mcpServers === 'object') {
        const repoServerNames = Object.keys(repoConfig.mcpServers);
        const newServerNames = repoServerNames.filter(name =>
            !localConfig.mcpServers || !localConfig.mcpServers.hasOwnProperty(name)
        );

        if (newServerNames.length > 0) {
            changes.push(`Added ${newServerNames.length} new non-conflicting mcpServers from repository: ${newServerNames.join(', ')}`);
        }
    }

    const mergedConfig = deepMergeWithProtection(localConfig, repoConfig);
    const configsAreEqual = JSON.stringify(localConfig) === JSON.stringify(mergedConfig);

    if (!configsAreEqual && !dryRun) {
        await atomicWrite(localConfigPath, mergedConfig, {
            preserveComments,
            backupOnSuccess
        });
    }

    return {
        updated: !configsAreEqual,
        changes
    };
}

export function getProtectedKeys(): string[] {
    return [...PROTECTED_KEYS];
}
