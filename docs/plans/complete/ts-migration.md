# CLI TypeScript Migration Plan

**Date**: 2026-02-21  
**Status**: Draft  
**Priority**: High  
**Reference Implementation**: [vsync](https://github.com/nicepkg/vsync)

---

## Executive Summary

This document outlines a comprehensive plan to modernize the `jaggers-config-manager` CLI by migrating from JavaScript to TypeScript and adopting professional CLI architecture patterns demonstrated by the vsync project.

### Current State

| Metric | Our CLI | vsync |
|--------|---------|-------|
| Language | JavaScript (ES Modules) | TypeScript |
| CLI Framework | `minimist` (basic) | `commander.js` (full-featured) |
| Type Safety | None | Full TypeScript + Zod |
| Test Coverage | 0% | 600+ tests |
| Commands | 1 (monolithic) | 7 (modular) |
| i18n | None | EN/ZH support |
| Error Handling | Basic | Rollback support |

---

## Phase 1: Foundation (Week 1-2)

### 1.1 TypeScript Setup

**Objective**: Establish TypeScript infrastructure without breaking existing functionality.

#### Tasks

- [ ] Initialize TypeScript configuration
  ```bash
  npm install -D typescript @types/node tsx
  npx tsc --init
  ```

- [ ] Create `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "outDir": "./dist",
      "rootDir": "./src",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "declaration": true,
      "sourceMap": true
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist", "test"]
  }
  ```

- [ ] Rename files: `cli/index.js` → `cli/src/index.ts`
- [ ] Add build scripts to `package.json`:
  ```json
  {
    "scripts": {
      "build": "tsc",
      "dev": "tsx src/index.ts",
      "typecheck": "tsc --noEmit"
    }
  }
  ```

### 1.2 Commander.js Migration

**Objective**: Replace `minimist` with a proper command framework.

#### Current Implementation (minimist)

```javascript
// cli/index.js:15
const args = minimist(process.argv.slice(2));

if (args.reset) {
    resetContext();
}
```

#### Target Implementation (Commander)

```typescript
// cli/src/index.ts
import { Command } from 'commander';

const program = new Command();

program
  .name('jaggers-config')
  .description('Manage AI coding tool configurations')
  .version('1.0.0');

program
  .command('sync')
  .description('Synchronize configurations to target environments')
  .option('--dry-run', 'Preview changes without writing')
  .option('--prune', 'Remove items not in source')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    await syncCommand(options);
  });

program
  .command('init')
  .description('Initialize configuration')
  .option('--user', 'Create user-level config')
  .action(async (options) => {
    await initCommand(options);
  });

program
  .command('status')
  .description('Show sync status')
  .action(async () => {
    await statusCommand();
  });

program.parse();
```

#### Dependencies to Add

```bash
npm install commander
npm install -D @types/node
```

### 1.3 Zod Schema Validation

**Objective**: Add runtime type validation for configuration.

#### Define Schemas

```typescript
// cli/src/types/config.ts
import { z } from 'zod';

export const SyncModeSchema = z.enum(['copy', 'symlink', 'prune']);

export const TargetConfigSchema = z.object({
  label: z.string(),
  path: z.string(),
  exists: z.boolean(),
});

export const ChangeSetSchema = z.object({
  skills: z.object({
    missing: z.array(z.string()),
    outdated: z.array(z.string()),
    drifted: z.array(z.string()),
    total: z.number(),
  }),
  hooks: z.object({
    missing: z.array(z.string()),
    outdated: z.array(z.string()),
    drifted: z.array(z.string()),
    total: z.number(),
  }),
  config: z.object({
    missing: z.array(z.string()),
    outdated: z.array(z.string()),
    drifted: z.array(z.string()),
    total: z.number(),
  }),
  commands: z.object({
    missing: z.array(z.string()),
    outdated: z.array(z.string()),
    drifted: z.array(z.string()),
    total: z.number(),
  }).optional(),
});

export type SyncMode = z.infer<typeof SyncModeSchema>;
export type ChangeSet = z.infer<typeof ChangeSetSchema>;
```

---

## Phase 2: Architecture Refactoring (Week 3-4)

### 2.1 Adapter Pattern Implementation

**Objective**: Abstract tool-specific logic into adapters.

#### Current Problem

```javascript
// cli/lib/diff.js:44-46 - Hardcoded tool detection
const isClaude = systemRoot.includes('.claude') || systemRoot.includes('Claude');
const isQwen = systemRoot.includes('.qwen') || systemRoot.includes('Qwen');
const isGemini = systemRoot.includes('.gemini') || systemRoot.includes('Gemini');
```

This approach is:
- Fragile (path string matching)
- Not extensible
- Scattered across multiple files

#### Target Architecture

```
cli/src/
├── adapters/
│   ├── base.ts          # Abstract base class
│   ├── claude.ts        # Claude Code adapter
│   ├── gemini.ts        # Gemini adapter
│   ├── qwen.ts          # Qwen adapter
│   └── registry.ts      # Adapter discovery
├── commands/
│   ├── sync.ts
│   ├── init.ts
│   ├── status.ts
│   └── plan.ts
├── core/
│   ├── diff.ts
│   ├── sync.ts
│   └── manifest.ts
└── types/
    ├── config.ts
    └── models.ts
```

#### Base Adapter Interface

```typescript
// cli/src/adapters/base.ts
import type { Skill, MCPServer, Hook, Command } from '../types/models.js';

export interface AdapterCapabilities {
  skills: boolean;
  hooks: boolean;
  mcp: boolean;
  commands: boolean;
}

export interface AdapterConfig {
  tool: string;
  baseDir: string;
  displayName: string;
}

export abstract class ToolAdapter {
  abstract readonly toolName: string;
  abstract readonly displayName: string;
  abstract readonly config: AdapterConfig;

  // Capabilities
  abstract getCapabilities(): AdapterCapabilities;

  // Paths
  abstract getConfigDir(): string;
  abstract getSkillsDir(): string;
  abstract getHooksDir(): string;
  abstract getCommandsDir(): string;

  // Read operations
  abstract readSkills(): Promise<Skill[]>;
  abstract readHooks(): Promise<Hook[]>;
  abstract readMCPServers(): Promise<MCPServer[]>;
  abstract readCommands(): Promise<Command[]>;

  // Write operations
  abstract writeSkills(skills: Skill[]): Promise<void>;
  abstract writeHooks(hooks: Hook[]): Promise<void>;
  abstract writeMCPServers(servers: MCPServer[]): Promise<void>;
  abstract writeCommands(commands: Command[]): Promise<void>;
}
```

#### Claude Code Adapter Example

```typescript
// cli/src/adapters/claude.ts
import { ToolAdapter, AdapterCapabilities } from './base.js';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

export class ClaudeCodeAdapter extends ToolAdapter {
  readonly toolName = 'claude-code';
  readonly displayName = 'Claude Code';

  constructor(baseDir: string) {
    super();
    this.config = { tool: this.toolName, baseDir, displayName: this.displayName };
  }

  getConfigDir(): string {
    return '.claude';
  }

  getSkillsDir(): string {
    return join(this.config.baseDir, 'skills');
  }

  getCapabilities(): AdapterCapabilities {
    return {
      skills: true,
      hooks: true,
      mcp: true,
      commands: true,
    };
  }

  async readSkills(): Promise<Skill[]> {
    const skillsDir = this.getSkillsDir();
    // Implementation...
  }

  // ... other methods
}
```

#### Adapter Registry

```typescript
// cli/src/adapters/registry.ts
import { ToolAdapter } from './base.js';
import { ClaudeCodeAdapter } from './claude.js';
import { GeminiAdapter } from './gemini.js';
import { QwenAdapter } from './qwen.js';

const adapters = new Map<string, typeof ToolAdapter>([
  ['claude-code', ClaudeCodeAdapter],
  ['gemini', GeminiAdapter],
  ['qwen', QwenAdapter],
]);

export function getAdapter(toolName: string, baseDir: string): ToolAdapter {
  const AdapterClass = adapters.get(toolName);
  if (!AdapterClass) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return new AdapterClass(baseDir);
}

export function detectAdapter(path: string): ToolAdapter | null {
  if (path.includes('.claude')) return new ClaudeCodeAdapter(path);
  if (path.includes('.gemini')) return new GeminiAdapter(path);
  if (path.includes('.qwen')) return new QwenAdapter(path);
  return null;
}
```

### 2.2 Command Structure

**Objective**: Split monolithic `index.js` into focused command modules.

#### Current Structure

```
cli/
├── index.js          # 151 lines - everything
└── lib/
    ├── context.js    # Target selection
    ├── diff.js       # Change detection
    └── sync.js       # Sync execution
```

#### Target Structure

```
cli/src/
├── index.ts              # Entry point only
├── cli-setup.ts          # Commander configuration
├── commands/
│   ├── sync.ts           # Sync command
│   ├── init.ts           # Init command
│   ├── status.ts         # Status command
│   ├── plan.ts           # Plan command (dry-run)
│   └── clean.ts          # Clean command
├── core/
│   ├── context.ts        # Context management
│   ├── diff.ts           # Diff calculation
│   ├── sync-executor.ts  # Sync execution
│   ├── manifest.ts       # State tracking
│   └── rollback.ts       # Backup/restore
└── utils/
    ├── logger.ts         # Logging utilities
    ├── hash.ts           # Content hashing
    └── i18n.ts           # Internationalization
```

---

## Phase 3: Quality Improvements (Week 5-6)

### 3.1 Test Infrastructure

**Objective**: Achieve 80%+ test coverage.

#### Setup

```bash
npm install -D vitest @vitest/coverage-v8
```

#### Test Structure

```
cli/test/
├── unit/
│   ├── adapters/
│   │   ├── claude.test.ts
│   │   ├── gemini.test.ts
│   │   └── registry.test.ts
│   ├── commands/
│   │   ├── sync.test.ts
│   │   └── init.test.ts
│   └── core/
│       ├── diff.test.ts
│       └── manifest.test.ts
└── integration/
    └── full-sync.test.ts
```

#### Example Test

```typescript
// cli/test/adapters/claude.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeCodeAdapter } from '../../src/adapters/claude.js';
import { mockFs } from '../helpers/mock-fs.js';

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter('/test/.claude');
  });

  describe('getCapabilities', () => {
    it('should return all capabilities as true', () => {
      const caps = adapter.getCapabilities();
      expect(caps.skills).toBe(true);
      expect(caps.hooks).toBe(true);
      expect(caps.mcp).toBe(true);
      expect(caps.commands).toBe(true);
    });
  });

  describe('readSkills', () => {
    it('should return empty array when no skills exist', async () => {
      mockFs({ '/test/.claude/skills': {} });
      const skills = await adapter.readSkills();
      expect(skills).toEqual([]);
    });
  });
});
```

### 3.2 Rollback Support

**Objective**: Add backup/restore for safe operations.

#### Implementation

```typescript
// cli/src/core/rollback.ts
import { copyFile, mkdir, rm, rename } from 'fs/promises';
import { join } from 'path';

export interface BackupInfo {
  originalPath: string;
  backupPath: string;
  timestamp: Date;
}

export async function createBackup(filePath: string): Promise<BackupInfo> {
  const timestamp = Date.now();
  const backupPath = `${filePath}.backup-${timestamp}`;
  
  await copyFile(filePath, backupPath);
  
  return {
    originalPath: filePath,
    backupPath,
    timestamp: new Date(),
  };
}

export async function restoreBackup(backup: BackupInfo): Promise<void> {
  await rename(backup.backupPath, backup.originalPath);
}

export async function cleanupBackup(backup: BackupInfo): Promise<void> {
  await rm(backup.backupPath, { force: true });
}
```

#### Usage in Sync

```typescript
// cli/src/commands/sync.ts
const backups: BackupInfo[] = [];

try {
  // Create backups before any write
  for (const file of filesToModify) {
    backups.push(await createBackup(file));
  }
  
  // Perform sync operations
  await executeSync(plan);
  
  // Clean up backups on success
  for (const backup of backups) {
    await cleanupBackup(backup);
  }
} catch (error) {
  // Restore all backups on failure
  console.error('Sync failed, rolling back...');
  for (const backup of backups) {
    await restoreBackup(backup);
  }
  throw error;
}
```

### 3.3 Manifest Tracking

**Objective**: Track sync state for incremental updates.

#### Schema

```typescript
// cli/src/types/manifest.ts
import { z } from 'zod';

export const ManifestItemSchema = z.object({
  type: z.enum(['skill', 'hook', 'config', 'command']),
  name: z.string(),
  hash: z.string(),
  lastSync: z.string(),
  source: z.string(),
});

export const ManifestSchema = z.object({
  version: z.string(),
  lastSync: z.string(),
  items: z.record(z.string(), ManifestItemSchema),
});

export type Manifest = z.infer<typeof ManifestSchema>;
```

#### Implementation

```typescript
// cli/src/core/manifest.ts
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { Manifest, ManifestSchema } from '../types/manifest.js';

const MANIFEST_FILE = '.jaggers-manifest.json';

export async function loadManifest(projectDir: string): Promise<Manifest> {
  const manifestPath = join(projectDir, MANIFEST_FILE);
  
  try {
    const content = await readFile(manifestPath, 'utf-8');
    const data = JSON.parse(content);
    return ManifestSchema.parse(data);
  } catch {
    return {
      version: '1.0.0',
      lastSync: new Date().toISOString(),
      items: {},
    };
  }
}

export async function saveManifest(projectDir: string, manifest: Manifest): Promise<void> {
  const manifestPath = join(projectDir, MANIFEST_FILE);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
```

### 3.4 Hash-based Diff

**Objective**: Replace mtime-based comparison with content hashing.

#### Current Problem

```javascript
// cli/lib/diff.js:133-140
if (systemMtime > repoMtime + 2000) {
    changeSet[category].drifted.push(item);
} else {
    changeSet[category].outdated.push(item);
}
```

This is unreliable because:
- File times can change without content changes
- 2-second threshold is arbitrary
- Doesn't detect actual content drift

#### Target Implementation

```typescript
// cli/src/utils/hash.ts
import { createHash } from 'crypto';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export async function hashDirectory(dirPath: string): Promise<string> {
  const files = await readdir(dirPath, { recursive: true });
  const hashes: string[] = [];
  
  for (const file of files.sort()) {
    const filePath = join(dirPath, file);
    const stats = await stat(filePath);
    if (stats.isFile()) {
      const hash = await hashFile(filePath);
      hashes.push(`${file}:${hash}`);
    }
  }
  
  return createHash('sha256').update(hashes.join('|')).digest('hex');
}
```

---

## Phase 4: Enhanced Features (Week 7-8)

### 4.1 Internationalization (i18n)

**Objective**: Support multiple languages.

#### Structure

```
cli/src/
├── locales/
│   ├── en.json
│   └── zh.json
└── utils/
    └── i18n.ts
```

#### Implementation

```typescript
// cli/src/utils/i18n.ts
import en from '../locales/en.json';
import zh from '../locales/zh.json';

type Translations = typeof en;
type Language = 'en' | 'zh';

const translations: Record<Language, Translations> = { en, zh };

let currentLang: Language = 'en';

export function t(key: string, params?: Record<string, string>): string {
  const keys = key.split('.');
  let value: unknown = translations[currentLang];
  
  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k];
  }
  
  if (typeof value !== 'string') return key;
  
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] || '');
  }
  
  return value;
}

export function setLanguage(lang: Language): void {
  currentLang = lang;
}
```

#### Locale File

```json
// cli/src/locales/en.json
{
  "commands": {
    "sync": {
      "title": "Synchronizing configurations",
      "dryRun": "Dry run mode - no changes will be written",
      "success": "Successfully synced {{count}} items",
      "error": "Sync failed: {{message}}"
    },
    "init": {
      "welcome": "Welcome to Jaggers Config Manager",
      "selectTargets": "Select target environments:",
      "complete": "Configuration initialized successfully"
    }
  }
}
```

### 4.2 Progress Indicators

**Objective**: Add visual feedback during operations.

```bash
npm install ora chalk
```

```typescript
// cli/src/utils/logger.ts
import ora, { Ora } from 'ora';
import chalk from 'chalk';

export class SyncUI {
  private spinner: Ora;
  
  constructor() {
    this.spinner = ora();
  }
  
  start(message: string): void {
    this.spinner.start(message);
  }
  
  succeed(message: string): void {
    this.spinner.succeed(chalk.green(message));
  }
  
  fail(message: string): void {
    this.spinner.fail(chalk.red(message));
  }
  
  showPlan(plan: SyncPlan): void {
    console.log(chalk.bold('\nSync Plan:'));
    
    for (const [tool, diff] of Object.entries(plan.diffs)) {
      console.log(chalk.cyan(`\n  ${tool}:`));
      console.log(chalk.green(`    + ${diff.created.length} to create`));
      console.log(chalk.blue(`    ^ ${diff.updated.length} to update`));
      console.log(chalk.red(`    - ${diff.deleted.length} to delete`));
    }
  }
}
```

---

## Migration Checklist

### Pre-Migration
- [ ] Create feature branch: `feat/typescript-migration`
- [ ] Ensure all existing functionality is documented
- [ ] Create integration tests for current behavior

### Phase 1: Foundation
- [ ] Initialize TypeScript configuration
- [ ] Add build scripts
- [ ] Migrate to Commander.js
- [ ] Add Zod schemas
- [ ] Verify all existing functionality works

### Phase 2: Architecture
- [ ] Create adapter base class
- [ ] Implement Claude adapter
- [ ] Implement Gemini adapter
- [ ] Implement Qwen adapter
- [ ] Create adapter registry
- [ ] Split commands into modules

### Phase 3: Quality
- [ ] Set up Vitest
- [ ] Write adapter tests
- [ ] Write command tests
- [ ] Implement rollback
- [ ] Implement manifest tracking
- [ ] Replace mtime diff with hash diff

### Phase 4: Features
- [ ] Add i18n support
- [ ] Add progress indicators
- [ ] Add `--json` output option
- [ ] Add `plan` command
- [ ] Add `status` command

### Post-Migration
- [ ] Update documentation
- [ ] Update README
- [ ] Create migration guide for users
- [ ] Publish as v2.0.0

---

## Dependencies Summary

### Production Dependencies
```json
{
  "commander": "^14.0.0",
  "zod": "^3.22.0",
  "chalk": "^5.3.0",
  "ora": "^8.0.0",
  "fs-extra": "^11.2.0",
  "comment-json": "^4.2.0"
}
```

### Development Dependencies
```json
{
  "typescript": "^5.3.0",
  "@types/node": "^20.10.0",
  "@types/fs-extra": "^11.0.0",
  "vitest": "^1.0.0",
  "@vitest/coverage-v8": "^1.0.0",
  "tsx": "^4.7.0",
  "tsup": "^8.0.0"
}
```

---

## References

- [vsync GitHub Repository](https://github.com/nicepkg/vsync)
- [vsync CLI Source](../vsync_repo/cli/src/)
- [Commander.js Documentation](https://github.com/tj/commander.js)
- [Zod Documentation](https://zod.dev/)
- [Vitest Documentation](https://vitest.dev/)

---

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Phase 1: Foundation | 2 weeks | Week 1 | Week 2 |
| Phase 2: Architecture | 2 weeks | Week 3 | Week 4 |
| Phase 3: Quality | 2 weeks | Week 5 | Week 6 |
| Phase 4: Features | 2 weeks | Week 7 | Week 8 |

**Total Estimated Duration**: 8 weeks