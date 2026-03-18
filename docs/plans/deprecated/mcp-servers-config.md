# MCP Servers Configuration and Sync

**Version:** 2.0.0  
**Last Updated:** 2026-02-21

---

## Overview

The Jaggers Agent Tools MCP configuration provides a **canonical source** for MCP servers that syncs across all supported agents:

- ✅ **Claude Code** (`~/.claude.json` - global user config)
- ✅ **Gemini** (`~/.gemini/settings.json`)
- ✅ **Qwen** (`~/.qwen/settings.json`)
- ✅ **Antigravity** (`~/.gemini/antigravity/mcp_config.json`)

---

## Configuration Files

### Core MCP Servers (`config/mcp_servers.json`)

**Installed by default** - these are the essential servers for all users:

| Server | Type | Description | Prerequisites |
|--------|------|-------------|---------------|
| `serena` | stdio | Code analysis and LSP integration | `uvx` (uv package manager) |
| `context7` | http | Documentation lookup | API key required |
| `github-grep` | http | Code search across GitHub | None |
| `deepwiki` | http | Technical documentation | None |

**Source:** [`config/mcp_servers.json`](../../config/mcp_servers.json)

---

### Optional MCP Servers (`config/mcp_servers_optional.json`)

**User choice** - prompted during sync:

| Server | Type | Description | Prerequisites |
|--------|------|-------------|---------------|
| `unitAI` | stdio | Multi-agent workflow orchestration | `npx` (Node.js) |
| `omni-search-engine` | sse | Local search engine | Running service on port 8765 |

**Source:** [`config/mcp_servers_optional.json`](../../config/mcp_servers_optional.json)

**Repositories:**
- unitAI: https://github.com/Jaggerxtrm/unitAI
- omni-search-engine: https://github.com/Jaggerxtrm/omni-search-engine

---

## Environment Variables

**File:** [`config/.env.example`](../../config/.env.example)

### Required Variables

```bash
# MCP: Context7 (Documentation Lookup)
CONTEXT7_API_KEY=ctx7sk-your-api-key-here
```

### Optional Variables

```bash
# MCP: Serena (auto-detected from working directory)
# SERENA_PROJECT_NAME=my-project
```

---

## Format Differences by Agent

The `ConfigAdapter` (`cli/lib/config-adapter.js`) handles automatic format conversion:

| Field | Claude Code | Gemini/Qwen | Antigravity |
|-------|-------------|-------------|-------------|
| **Env var syntax** | `${VAR}` | `${VAR}` | `${VAR}` |
| **Type field** | ✅ Required (`stdio`/`http`/`sse`) | ❌ Not used | ✅ Required |
| **HTTP URL field** | `url` | `url` | `serverUrl` |
| **SSE URL field** | `url` | `url` | `serverUrl` |
| **Disabled flag** | ❌ | ❌ | ✅ Supported |

### Example Transformations

**Canonical Source (config/mcp_servers.json):**
```json
{
  "context7": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp",
    "headers": {
      "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}"
    }
  }
}
```

**Gemini/Qwen Output:**
```json
{
  "context7": {
    "url": "https://mcp.context7.com/mcp",
    "headers": {
      "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}"
    }
  }
}
```

**Antigravity Output:**
```json
{
  "context7": {
    "type": "http",
    "serverUrl": "https://mcp.context7.com/mcp",
    "headers": {
      "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}"
    }
  }
}
```

**Claude Code Output:**
```json
{
  "context7": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp",
    "headers": {
      "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}"
    }
  }
}
```

---

## Sync Workflow

### Pre-Sync Checklist

1. **Check prerequisites:**
   ```bash
   # For Serena
   command -v uvx || echo "uvx required (install with: pip install uv)"
   
   # For unitAI
   command -v npx || echo "Node.js required"
   
   # For omni-search-engine
   curl -s http://127.0.0.1:8765/sse || echo "Service not running"
   ```

2. **Prepare API keys:**
   - Context7: Get key from https://context7.com/
   - Store in `~/.jaggers/.env` or project `.env`

---

### Sync Process

```
┌─────────────────────────────────────────────────────────────┐
│  1. DETECT: Check existing configs                          │
│     - Scan ~/.claude.json, ~/.gemini/settings.json, etc.    │
│     - Identify which servers already exist                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. PROMPT: API Keys                                        │
│     - "context7 requires an API key"                        │
│     - [Use existing] / [Enter new] / [Skip context7]        │
│     - Store in ~/.jaggers/.env                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. PROMPT: Optional Servers                                │
│     - "Install optional MCP servers?"                       │
│     - ☐ unitAI (multi-agent workflows)                      │
│     - ☐ omni-search-engine (requires local service)         │
│     - Show repository links for each                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. VALIDATE: Prerequisites                                 │
│     - Check uvx, npx, running services                      │
│     - Warn if missing dependencies                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  5. SYNC: Apply with format adaptation                      │
│     - Claude: Add type field, update ~/.claude.json         │
│     - Gemini/Qwen: Remove type field                        │
│     - Antigravity: Add type, use serverUrl for HTTP         │
│     - Preserve existing local servers (vault protection)    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  6. NOTES: Display repository links                         │
│     - unitAI: https://github.com/Jaggerxtrm/unitAI          │
│     - omni-search-engine: https://github.com/Jaggerxtrm/... │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### ConfigAdapter Class

**File:** `cli/lib/config-adapter.js`

**Methods:**

```javascript
// Main entry point
adaptMcpConfig(canonicalConfig): adaptedConfig

// Format-specific transformations
transformToGeminiFormat(servers)    // Removes 'type' field
transformToClaudeFormat(servers)    // Ensures 'type' field
transformToAntigravityFormat(servers) // 'url' → 'serverUrl'

// Utility
resolveMcpPaths(servers)            // Expands ~/ and ${HOME}
```

### EnvVarTransformer Class

**Handles environment variable syntax conversion:**

- Claude/Gemini/Qwen: `${VAR}`
- Cursor: `${env:VAR}`
- OpenCode: `{env:VAR}`

---

## Vault Protection

During sync, the following keys are **protected** (never overwritten):

- `permissions.allow` - User-defined tool permissions
- `hooks.*` - User-defined hooks
- `enabledPlugins` - User-enabled plugins
- `model` - User's preferred model
- `skillSuggestions.enabled` - User preferences

**MCP servers** are merged intelligently:
- Canonical servers are added/updated
- Local-only servers are preserved (not in canonical source)
- Use `--prune` mode to remove servers not in canonical source

---

## Troubleshooting

### Serena not working

**Problem:** `uvx: command not found`

**Solution:**
```bash
# Install uv package manager
pip install uv
# or
curl -LsSf https://astral.sh/uv/install.sh | sh
```

---

### Context7 authentication failed

**Problem:** `401 Unauthorized`

**Solution:**
1. Check API key in `.env`:
   ```bash
   cat ~/.jaggers/.env | grep CONTEXT7_API_KEY
   ```
2. Get new key from https://context7.com/
3. Update `.env` and re-sync

---

### Omni search-engine connection refused

**Problem:** `ECONNREFUSED 127.0.0.1:8765`

**Solution:**
1. Start omni-search-engine service:
   ```bash
   cd ~/projects/omni-search-engine
   npm start
   ```
2. Verify it's running:
   ```bash
   curl http://127.0.0.1:8765/sse
   ```
3. See setup guide: https://github.com/Jaggerxtrm/omni-search-engine

---

### Antigravity config not updating

**Problem:** `serverUrl` not being used

**Solution:**
- Ensure `transformToAntigravityFormat()` is called
- Check `isAntigravity` detection in `ConfigAdapter` constructor
- Verify `url` → `serverUrl` transformation

---

## Testing

### Manual Testing

```bash
# Test Gemini format adaptation
node -e "
import { ConfigAdapter } from './cli/lib/config-adapter.js';
const adapter = new ConfigAdapter('/home/dawid/.gemini');
const config = { mcpServers: { context7: { type: 'http', url: '...' } } };
console.log(JSON.stringify(adapter.adaptMcpConfig(config), null, 2));
"

# Test Claude format adaptation
node -e "
import { ConfigAdapter } from './cli/lib/config-adapter.js';
const adapter = new ConfigAdapter('/home/dawid/.claude');
const config = { mcpServers: { context7: { type: 'http', url: '...' } } };
console.log(JSON.stringify(adapter.adaptMcpConfig(config), null, 2));
"
```

---

## Related Documentation

- [Vault Pattern Implementation](../../vault-pattern-implementation.md)
- [ConfigAdapter Source](../../cli/lib/config-adapter.js)
- [Universal Configuration Hub](../../ROADMAP.md#phase-1-universal-configuration-hub--format-adaptation-completed-v150)
- [vsync Repository](../../vsync_repo/README.md)

---

## Changelog

### v2.0.0 (2026-02-21)

- ✅ Split into `mcp_servers.json` (core) and `mcp_servers_optional.json`
- ✅ Removed `filesystem`, `git`, `memory` (not in actual use)
- ✅ Removed `gmail` and `yfinance` (project-specific)
- ✅ Added `type` field support for Claude/Antigravity
- ✅ Added `serverUrl` transformation for Antigravity
- ✅ Added `.env.example` for API key documentation
- ✅ Added repository links for optional servers

### v1.0.0 (Previous)

- Initial canonical MCP configuration
- Basic format adaptation for Gemini/Qwen
