import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncProjectMcpConfig } from '../core/project-mcp-sync.js';

let projectRoot = '';
let previousContext7: string | undefined;

beforeEach(async () => {
  previousContext7 = process.env.CONTEXT7_API_KEY;
  delete process.env.CONTEXT7_API_KEY;

  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xtrm-mcp-sync-'));
  await fs.ensureDir(path.join(projectRoot, '.xtrm', 'config'));

  await fs.writeJson(path.join(projectRoot, '.xtrm', 'config', 'mcp_servers.json'), {
    mcpServers: {
      serena: {
        type: 'stdio',
        command: 'uvx',
        args: ['serena', 'start-mcp-server'],
      },
      context7: {
        type: 'http',
        url: 'https://mcp.context7.com/mcp',
        headers: {
          CONTEXT7_API_KEY: '${CONTEXT7_API_KEY}',
        },
      },
      'github-grep': {
        type: 'http',
        url: 'https://mcp.grep.app',
      },
      deepwiki: {
        type: 'http',
        url: 'https://mcp.deepwiki.com/mcp',
      },
      gitnexus: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'gitnexus', 'mcp'],
      },
    },
  }, { spaces: 2 });

  await fs.writeJson(path.join(projectRoot, '.xtrm', 'config', 'mcp_servers_optional.json'), {
    mcpServers: {
      unitAI: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@jaggerxtrm/unitai'],
      },
    },
  }, { spaces: 2 });
});

afterEach(async () => {
  if (previousContext7) {
    process.env.CONTEXT7_API_KEY = previousContext7;
  } else {
    delete process.env.CONTEXT7_API_KEY;
  }
  await fs.remove(projectRoot);
});

describe('syncProjectMcpConfig', () => {
  it('creates .mcp.json from required + optional canonical configs', async () => {
    const result = await syncProjectMcpConfig(projectRoot);
    const mcpPath = path.join(projectRoot, '.mcp.json');

    expect(result.createdFile).toBe(true);
    expect(result.wroteFile).toBe(true);
    expect(result.addedServers).toEqual(expect.arrayContaining([
      'serena',
      'context7',
      'github-grep',
      'deepwiki',
      'gitnexus',
      'unitAI',
    ]));
    expect(result.missingEnvWarnings).toContain('context7: missing CONTEXT7_API_KEY');

    const content = await fs.readJson(mcpPath);
    expect(Object.keys(content.mcpServers)).toEqual(expect.arrayContaining([
      'serena',
      'context7',
      'github-grep',
      'deepwiki',
      'gitnexus',
      'unitAI',
    ]));
  });

  it('is idempotent and preserves user-added servers on rerun', async () => {
    await syncProjectMcpConfig(projectRoot);

    const mcpPath = path.join(projectRoot, '.mcp.json');
    const first = await fs.readJson(mcpPath);
    first.mcpServers.custom = {
      type: 'stdio',
      command: 'node',
      args: ['custom-mcp.js'],
    };
    await fs.writeJson(mcpPath, first, { spaces: 2 });

    const secondRun = await syncProjectMcpConfig(projectRoot);
    expect(secondRun.wroteFile).toBe(false);
    expect(secondRun.addedServers).toEqual([]);

    const second = await fs.readJson(mcpPath);
    expect(second.mcpServers.custom).toEqual(first.mcpServers.custom);

    const canonicalKeys = Object.keys(second.mcpServers).filter((name) => name === 'serena');
    expect(canonicalKeys).toHaveLength(1);
  });

  it('preserves nested user config during canonical update', async () => {
    await syncProjectMcpConfig(projectRoot);

    const mcpPath = path.join(projectRoot, '.mcp.json');
    await fs.writeJson(mcpPath, {
      mcpServers: {
        context7: {
          type: 'http',
          url: 'https://mcp.context7.com/mcp',
          headers: {
            CONTEXT7_API_KEY: '${CONTEXT7_API_KEY}',
            USER_CUSTOM_HEADER: 'keep-me',
          },
          nested: {
            preserve: true,
          },
        },
        custom: {
          type: 'stdio',
          command: 'node',
          args: ['custom-mcp.js'],
        },
      },
    }, { spaces: 2 });

    await fs.writeJson(path.join(projectRoot, '.xtrm', 'config', 'mcp_servers.json'), {
      mcpServers: {
        context7: {
          type: 'http',
          url: 'https://mcp.context7.com/mcp',
          headers: {
            CONTEXT7_API_KEY: '${CONTEXT7_API_KEY}',
          },
          timeoutMs: 5000,
        },
        gitnexus: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'gitnexus', 'mcp'],
        },
        serena: {
          type: 'stdio',
          command: 'uvx',
          args: ['serena', 'start-mcp-server'],
        },
      },
    }, { spaces: 2 });

    const result = await syncProjectMcpConfig(projectRoot);
    expect(result.addedServers).toEqual(expect.arrayContaining(['gitnexus', 'serena']));

    const merged = await fs.readJson(mcpPath);
    expect(merged.mcpServers.context7.headers.USER_CUSTOM_HEADER).toBe('keep-me');
    expect(merged.mcpServers.context7.nested).toEqual({ preserve: true });
    expect(merged.mcpServers.custom).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['custom-mcp.js'],
    });
    expect(merged.mcpServers.gitnexus).toBeDefined();
    expect(merged.mcpServers.serena).toBeDefined();
  });

  it('handles missing optional config gracefully', async () => {
    await fs.remove(path.join(projectRoot, '.xtrm', 'config', 'mcp_servers_optional.json'));

    const result = await syncProjectMcpConfig(projectRoot);

    expect(result.wroteFile).toBe(true);
    expect(result.createdFile).toBe(true);
    expect(result.addedServers).toEqual(expect.arrayContaining([
      'serena',
      'context7',
      'github-grep',
      'deepwiki',
      'gitnexus',
    ]));
    expect(result.addedServers).not.toContain('unitAI');

    const content = await fs.readJson(path.join(projectRoot, '.mcp.json'));
    expect(content.mcpServers.unitAI).toBeUndefined();
    expect(content.mcpServers.serena).toBeDefined();
    expect(content.mcpServers.context7).toBeDefined();
  });

  it('supports dry run without writing files', async () => {
    const result = await syncProjectMcpConfig(projectRoot, { dryRun: true });
    expect(result.wroteFile).toBe(true);
    expect(await fs.pathExists(path.join(projectRoot, '.mcp.json'))).toBe(false);
  });
});
