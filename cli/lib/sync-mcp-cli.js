import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import kleur from 'kleur';
import { ensureEnvFile, loadEnvFile, checkRequiredEnvVars, handleMissingEnvVars, getEnvFilePath } from './env-manager.js';

/**
 * Agent-specific MCP CLI handlers
 */
const AGENT_CLI = {
  claude: {
    command: 'claude',
    listArgs: ['mcp', 'list'], // list doesn't support -s flag
    addStdio: (name, cmd, args, env) => {
      // Use -s user for user-level config (~/.claude.json global)
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
      // Use -s user for user-level config
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
    listArgs: ['mcp', 'list'],
    addStdio: (name, cmd, args, env) => {
      const base = ['mcp', 'add', name, cmd];
      if (args && args.length > 0) base.push(...args);
      if (env && Object.keys(env).length > 0) {
        for (const [key, value] of Object.entries(env)) {
          base.push('-e', `${key}=${resolveEnvVar(value)}`);
        }
      }
      return base;
    },
    addHttp: (name, url, headers) => {
      const base = ['mcp', 'add', '-t', 'http', name, url];
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          base.push('-H', `${key}=${resolveEnvVar(value)}`);
        }
      }
      return base;
    },
    addSse: (name, url) => {
      return ['mcp', 'add', '-t', 'sse', name, url];
    },
    remove: (name) => ['mcp', 'remove', name],
    parseList: (output) => parseMcpListOutput(output, /^✓ ([a-zA-Z0-9_-]+):/)
  },
  qwen: {
    command: 'qwen',
    listArgs: ['mcp', 'list'],
    addStdio: (name, cmd, args, env) => {
      const base = ['mcp', 'add', name, cmd];
      if (args && args.length > 0) base.push(...args);
      if (env && Object.keys(env).length > 0) {
        for (const [key, value] of Object.entries(env)) {
          base.push('-e', `${key}=${resolveEnvVar(value)}`);
        }
      }
      return base;
    },
    addHttp: (name, url, headers) => {
      const base = ['mcp', 'add', '-t', 'http', name, url];
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          base.push('-H', `${key}=${resolveEnvVar(value)}`);
        }
      }
      return base;
    },
    addSse: (name, url) => {
      return ['mcp', 'add', '-t', 'sse', name, url];
    },
    remove: (name) => ['mcp', 'remove', name],
    parseList: (output) => parseMcpListOutput(output, /^✓ ([a-zA-Z0-9_-]+):/)
  }
};

/**
 * Parse MCP list output to extract server names
 */
function parseMcpListOutput(output, pattern) {
  const servers = [];
  for (const line of output.split('\n')) {
    const match = line.match(pattern);
    if (match) {
      servers.push(match[1]);
    }
  }
  return servers;
}

/**
 * Resolve environment variable references like ${VAR}
 */
function resolveEnvVar(value) {
  if (typeof value !== 'string') return value;
  
  const envMatch = value.match(/\$\{([A-Z0-9_]+)\}/i);
  if (envMatch) {
    const envName = envMatch[1];
    const envValue = process.env[envName];
    if (envValue) {
      return envValue;
    } else {
      // Return empty string - server will be added but won't work until key is added
      console.warn(kleur.yellow(`  ⚠️  Environment variable ${envName} is not set in ${getEnvFilePath()}`));
      return '';
    }
  }
  
  return value;
}

/**
 * Detect which agent CLI is available
 */
export function detectAgent(systemRoot) {
  if (systemRoot.includes('.claude') || systemRoot.includes('Claude')) {
    return 'claude';
  } else if (systemRoot.includes('.gemini') || systemRoot.includes('Gemini')) {
    return 'gemini';
  } else if (systemRoot.includes('.qwen') || systemRoot.includes('Qwen')) {
    return 'qwen';
  }
  return null;
}

/**
 * Build MCP add commands for a server
 */
function buildAddCommand(agent, name, server) {
  const cli = AGENT_CLI[agent];
  if (!cli) return null;

  // HTTP/SSE servers
  if (server.url || server.serverUrl) {
    const url = server.url || server.serverUrl;
    const type = server.type || (url.includes('/sse') ? 'sse' : 'http');
    
    if (type === 'sse') {
      return cli.addSse(name, url);
    } else {
      return cli.addHttp(name, url, server.headers);
    }
  }
  
  // Stdio servers
  if (server.command) {
    return cli.addStdio(name, server.command, server.args, server.env);
  }
  
  console.warn(kleur.yellow(`  ⚠️  Skipping server "${name}": Unknown configuration`));
  return null;
}

/**
 * Execute an MCP command
 */
function executeCommand(agent, args, dryRun = false) {
  const cli = AGENT_CLI[agent];
  
  // Build command string with proper quoting for arguments with spaces
  const quotedArgs = args.map(arg => {
    if (arg.includes(' ') && !arg.startsWith('"') && !arg.startsWith("'")) {
      return `"${arg}"`;
    }
    return arg;
  });
  const command = `${cli.command} ${quotedArgs.join(' ')}`;
  
  if (dryRun) {
    console.log(kleur.cyan(`  [DRY RUN] ${command}`));
    return { success: true, dryRun: true };
  }

  try {
    execSync(command, { stdio: 'pipe' });
    console.log(kleur.green(`  ✓ ${args.slice(2).join(' ')}`));
    return { success: true };
  } catch (error) {
    const stderr = error.stderr?.toString() || error.message;
    
    // Handle "already exists" case as success (idempotent)
    if (stderr.includes('already exists') || stderr.includes('already configured')) {
      // Extract server name based on agent
      let serverName = 'unknown';
      if (agent === 'claude') {
        // Claude: claude mcp add [-s scope] [--transport type] <name> ...
        // Find the server name: first non-flag arg after 'add' that's not scope or transport
        const addIndex = args.indexOf('add');
        for (let i = addIndex + 1; i < args.length; i++) {
          const arg = args[i];
          if (arg === '--') continue; // Skip separator
          if (arg.startsWith('-')) continue; // Skip flags
          if (['local', 'user', 'project', 'http', 'sse', 'stdio'].includes(arg)) continue; // Skip scope and transport
          serverName = arg;
          break;
        }
      } else if (agent === 'gemini' || agent === 'qwen') {
        // Gemini/Qwen: <agent> mcp add [-t type] <name> <url>...
        // Find first non-flag arg after 'add' that's not a transport type
        const addIndex = args.indexOf('add');
        for (let i = addIndex + 1; i < args.length; i++) {
          const arg = args[i];
          if (arg === '-t') { i++; continue; } // Skip transport flag and value
          if (arg.startsWith('-')) continue; // Skip other flags
          if (['http', 'sse', 'stdio'].includes(arg)) continue; // Skip transport types
          serverName = arg;
          break;
        }
      } else {
        // Fallback: use third arg
        serverName = args[2];
      }
      console.log(kleur.dim(`  ✓ ${serverName} (already configured)`));
      return { success: true, skipped: true };
    }
    
    console.log(kleur.red(`  ✗ Failed: ${stderr.trim()}`));
    return { success: false, error: stderr };
  }
}

/**
 * Get current MCP servers for an agent
 */
function getCurrentServers(agent) {
  const cli = AGENT_CLI[agent];
  try {
    const output = execSync(`${cli.command} ${cli.listArgs.join(' ')}`, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return cli.parseList(output);
  } catch (error) {
    return [];
  }
}

/**
 * Sync MCP servers to an agent using official CLI
 * 
 * @param {string} agent - 'claude', 'gemini', or 'qwen'
 * @param {Object} mcpConfig - Canonical MCP configuration
 * @param {boolean} dryRun - Show commands without executing
 * @param {boolean} prune - Remove servers not in canonical config
 */
export async function syncMcpServersWithCli(agent, mcpConfig, dryRun = false, prune = false) {
  const cli = AGENT_CLI[agent];
  if (!cli) {
    console.log(kleur.yellow(`  ⚠️  Unsupported agent: ${agent}`));
    return;
  }

  console.log(kleur.bold(`\nSyncing MCP servers to ${agent}...`));

  // Step 0: Ensure .env file exists and load it
  ensureEnvFile();
  loadEnvFile();

  // Step 1: Check for missing required env vars
  const missingEnvVars = checkRequiredEnvVars();
  if (missingEnvVars.length > 0) {
    handleMissingEnvVars(missingEnvVars);
    // Continue anyway - servers will be added but may not work until keys are added
  }

  // Step 2: Get current servers
  const currentServers = getCurrentServers(agent);
  const canonicalServers = new Set(Object.keys(mcpConfig.mcpServers || {}));

  // Step 2: Remove servers not in canonical (if prune mode)
  if (prune) {
    console.log(kleur.red('\n  Prune mode: Removing servers not in canonical config...'));
    for (const serverName of currentServers) {
      if (!canonicalServers.has(serverName)) {
        console.log(kleur.red(`  Removing: ${serverName}`));
        executeCommand(agent, cli.remove(serverName), dryRun);
      }
    }
  }

  // Step 3: Add/update canonical servers
  console.log(kleur.cyan('\n  Adding/Updating canonical servers...'));
  let successCount = 0;
  
  for (const [name, server] of Object.entries(mcpConfig.mcpServers)) {
    const cmd = buildAddCommand(agent, name, server);
    if (cmd) {
      const result = executeCommand(agent, cmd, dryRun);
      if (result.success) {
        successCount++;
      }
    }
  }

  // Summary
  console.log(kleur.green(`\n  ✓ Synced ${successCount} MCP servers`));
}

/**
 * Load canonical MCP config from repository
 */
export function loadCanonicalMcpConfig(repoRoot) {
  const corePath = path.join(repoRoot, 'config', 'claude.mcp.json');
  const optionalPath = path.join(repoRoot, 'config', 'claude.mcp.optional.json');
  
  const config = { mcpServers: {} };
  
  // Always load core servers
  if (fs.existsSync(corePath)) {
    const core = fs.readJsonSync(corePath);
    config.mcpServers = { ...config.mcpServers, ...core.mcpServers };
  }
  
  // Optionally load optional servers (user would have selected these)
  // For now, we don't auto-load them
  // if (fs.existsSync(optionalPath)) {
  //   const optional = fs.readJsonSync(optionalPath);
  //   config.mcpServers = { ...config.mcpServers, ...optional.mcpServers };
  // }
  
  return config;
}
