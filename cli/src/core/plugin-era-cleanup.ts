import kleur from 'kleur';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { confirmDestructiveAction } from '../utils/confirmation.js';

export type CleanupScope = 'global' | 'project' | 'all';

type CleanupOperationType = 'delete-path' | 'delete-settings-keys';

interface CleanupOperation {
  scope: Exclude<CleanupScope, 'all'>;
  type: CleanupOperationType;
  targetPath: string;
  label: string;
  settingsKeys?: readonly string[];
}

export interface RunPluginEraCleanupOptions {
  dryRun?: boolean;
  yes?: boolean;
  scope?: CleanupScope;
  repoRoot?: string;
}

export interface CleanupResult {
  dryRun: boolean;
  scopesProcessed: Array<Exclude<CleanupScope, 'all'>>;
  planned: CleanupOperation[];
  removedPaths: string[];
  updatedSettings: string[];
}

const SETTINGS_PLUGIN_KEYS = ['enabledPlugins', 'extraKnownMarketplaces'] as const;

const XTRM_MANAGED_PI_EXTENSIONS = new Set([
  'beads',
  'session-flow',
  'quality-gates',
  'service-skills',
  'xtrm-loader',
  'custom-footer',
  'lsp-bootstrap',
  'plan-mode',
  'auto-session-name',
  'auto-update',
  'compact-header',
  'git-checkpoint',
  'pi-serena-compact',
  'xtrm-ui',
  'core',
]);

const LEGACY_PROJECT_HOOK_FILES: Array<{ legacyFile: string; duplicatePath: string }> = [
  { legacyFile: 'hook-config.json', duplicatePath: path.join('.xtrm', 'config', 'hooks.json') },
  { legacyFile: 'quality-check.cjs', duplicatePath: path.join('.xtrm', 'hooks', 'quality-check.cjs') },
  { legacyFile: 'quality-check.py', duplicatePath: path.join('.xtrm', 'hooks', 'quality-check.py') },
  { legacyFile: 'specialists-complete.mjs', duplicatePath: path.join('.xtrm', 'hooks', 'specialists-complete.mjs') },
  { legacyFile: 'specialists-session-start.mjs', duplicatePath: path.join('.xtrm', 'hooks', 'specialists-session-start.mjs') },
];

export const PLUGIN_ERA_ARTIFACTS = {
  settingsKeys: SETTINGS_PLUGIN_KEYS,
  piExtensionIds: Array.from(XTRM_MANAGED_PI_EXTENSIONS),
  legacyProjectHookFiles: LEGACY_PROJECT_HOOK_FILES.map((entry) => entry.legacyFile),
} as const;

export async function runPluginEraCleanup(opts: RunPluginEraCleanupOptions = {}): Promise<CleanupResult> {
  const dryRun = opts.dryRun ?? false;
  const yes = opts.yes ?? false;
  const scope = opts.scope ?? 'all';
  const repoRoot = opts.repoRoot ?? process.cwd();

  const scopes = resolveScopes(scope);
  const managedAgentSkills = await getManagedAgentSkillNames(repoRoot);

  const operations = await planCleanupOperations({
    repoRoot,
    scopes,
    managedAgentSkills,
  });

  if (operations.length === 0) {
    console.log(kleur.dim('  ✓ Plugin-era prune: nothing to remove'));
    return {
      dryRun,
      scopesProcessed: scopes,
      planned: [],
      removedPaths: [],
      updatedSettings: [],
    };
  }

  console.log(kleur.bold('\n  Plugin-era cleanup (--prune)'));
  printCleanupPlan(operations, dryRun);

  const removedPaths: string[] = [];
  const updatedSettings: string[] = [];

  for (const currentScope of scopes) {
    const scopeOperations = operations.filter((operation) => operation.scope === currentScope);
    if (scopeOperations.length === 0) {
      continue;
    }

    if (!dryRun) {
      const confirmed = await confirmDestructiveAction({
        yes,
        initial: false,
        message: `Apply plugin-era cleanup for ${currentScope} scope?`,
      });

      if (!confirmed) {
        console.log(kleur.yellow(`  ↷ Skipped ${currentScope} cleanup by user choice`));
        continue;
      }
    }

    for (const operation of scopeOperations) {
      if (operation.type === 'delete-path') {
        if (!dryRun) {
          await fs.remove(operation.targetPath);
        }
        removedPaths.push(operation.targetPath);
      }

      if (operation.type === 'delete-settings-keys') {
        if (!dryRun) {
          await deleteSettingsKeys(operation.targetPath, operation.settingsKeys ?? SETTINGS_PLUGIN_KEYS);
        }
        updatedSettings.push(operation.targetPath);
      }
    }
  }

  return {
    dryRun,
    scopesProcessed: scopes,
    planned: operations,
    removedPaths,
    updatedSettings,
  };
}

function resolveScopes(scope: CleanupScope): Array<Exclude<CleanupScope, 'all'>> {
  if (scope === 'all') {
    return ['global', 'project'];
  }
  return [scope];
}

async function planCleanupOperations(params: {
  repoRoot: string;
  scopes: Array<Exclude<CleanupScope, 'all'>>;
  managedAgentSkills: ReadonlySet<string>;
}): Promise<CleanupOperation[]> {
  const operations: CleanupOperation[] = [];

  if (params.scopes.includes('global')) {
    operations.push(...await planGlobalOperations(params.managedAgentSkills));
  }

  if (params.scopes.includes('project')) {
    operations.push(...await planProjectOperations(params.repoRoot));
  }

  return operations;
}

async function planGlobalOperations(managedAgentSkills: ReadonlySet<string>): Promise<CleanupOperation[]> {
  const operations: CleanupOperation[] = [];

  const claudeDir = path.join(os.homedir(), '.claude');
  const pluginDir = path.join(claudeDir, 'plugins');
  const claudeSkillsDir = path.join(claudeDir, 'skills');
  const claudeHooksDir = path.join(claudeDir, 'hooks');
  const claudeSettingsPath = path.join(claudeDir, 'settings.json');

  if (await fs.pathExists(pluginDir)) {
    operations.push({
      scope: 'global',
      type: 'delete-path',
      targetPath: pluginDir,
      label: '~/.claude/plugins/',
    });
  }

  if (await hasSettingsKeys(claudeSettingsPath, SETTINGS_PLUGIN_KEYS)) {
    operations.push({
      scope: 'global',
      type: 'delete-settings-keys',
      targetPath: claudeSettingsPath,
      label: '~/.claude/settings.json keys: enabledPlugins, extraKnownMarketplaces',
      settingsKeys: SETTINGS_PLUGIN_KEYS,
    });
  }

  if (await fs.pathExists(claudeSkillsDir)) {
    operations.push({
      scope: 'global',
      type: 'delete-path',
      targetPath: claudeSkillsDir,
      label: '~/.claude/skills/',
    });
  }

  if (await fs.pathExists(claudeHooksDir)) {
    operations.push({
      scope: 'global',
      type: 'delete-path',
      targetPath: claudeHooksDir,
      label: '~/.claude/hooks/',
    });
  }

  const piExtensionsDir = path.join(os.homedir(), '.pi', 'agent', 'extensions');
  operations.push(...await planManagedDirectoryEntryDeletes({
    scope: 'global',
    baseDir: piExtensionsDir,
    managedNames: XTRM_MANAGED_PI_EXTENSIONS,
    labelPrefix: '~/.pi/agent/extensions/',
  }));

  const agentsSkillsDir = path.join(os.homedir(), '.agents', 'skills');
  operations.push(...await planManagedDirectoryEntryDeletes({
    scope: 'global',
    baseDir: agentsSkillsDir,
    managedNames: managedAgentSkills,
    labelPrefix: '~/.agents/skills/',
  }));

  return operations;
}

async function planProjectOperations(repoRoot: string): Promise<CleanupOperation[]> {
  const operations: CleanupOperation[] = [];

  const claudeSettingsPath = path.join(repoRoot, '.claude', 'settings.json');
  if (await hasSettingsKeys(claudeSettingsPath, SETTINGS_PLUGIN_KEYS)) {
    operations.push({
      scope: 'project',
      type: 'delete-settings-keys',
      targetPath: claudeSettingsPath,
      label: '.claude/settings.json keys: enabledPlugins, extraKnownMarketplaces',
      settingsKeys: SETTINGS_PLUGIN_KEYS,
    });
  }

  const projectHooksDir = path.join(repoRoot, '.claude', 'hooks');
  for (const { legacyFile, duplicatePath } of LEGACY_PROJECT_HOOK_FILES) {
    const legacyPath = path.join(projectHooksDir, legacyFile);
    const canonicalPath = path.join(repoRoot, duplicatePath);

    if (!await fs.pathExists(legacyPath)) {
      continue;
    }

    if (!await fs.pathExists(canonicalPath)) {
      continue;
    }

    operations.push({
      scope: 'project',
      type: 'delete-path',
      targetPath: legacyPath,
      label: `.claude/hooks/${legacyFile}`,
    });
  }

  return operations;
}

async function planManagedDirectoryEntryDeletes(params: {
  scope: Exclude<CleanupScope, 'all'>;
  baseDir: string;
  managedNames: ReadonlySet<string>;
  labelPrefix: string;
}): Promise<CleanupOperation[]> {
  if (!await fs.pathExists(params.baseDir)) {
    return [];
  }

  const entries = await fs.readdir(params.baseDir);
  return entries
    .filter((entry) => params.managedNames.has(entry))
    .map((entry) => ({
      scope: params.scope,
      type: 'delete-path' as const,
      targetPath: path.join(params.baseDir, entry),
      label: `${params.labelPrefix}${entry}`,
    }));
}

function printCleanupPlan(operations: CleanupOperation[], dryRun: boolean): void {
  const byScope: Record<Exclude<CleanupScope, 'all'>, CleanupOperation[]> = {
    global: [],
    project: [],
  };

  for (const operation of operations) {
    byScope[operation.scope].push(operation);
  }

  for (const [scopeName, scopeOps] of Object.entries(byScope) as Array<[Exclude<CleanupScope, 'all'>, CleanupOperation[]]>) {
    if (scopeOps.length === 0) {
      continue;
    }

    console.log(kleur.cyan(`  ${scopeName}:`));
    for (const operation of scopeOps) {
      const action = operation.type === 'delete-settings-keys' ? 'update' : 'delete';
      const prefix = dryRun ? '[DRY RUN] would' : 'will';
      console.log(kleur.dim(`    • ${prefix} ${action} ${operation.label}`));
    }
  }
  console.log('');
}

async function hasSettingsKeys(settingsPath: string, keys: readonly string[]): Promise<boolean> {
  const settings = await readJsonObject(settingsPath);
  if (!settings) {
    return false;
  }

  return keys.some((key) => key in settings);
}

async function deleteSettingsKeys(settingsPath: string, keys: readonly string[]): Promise<void> {
  const settings = await readJsonObject(settingsPath);
  if (!settings) {
    return;
  }

  for (const key of keys) {
    delete settings[key];
  }

  await fs.ensureDir(path.dirname(settingsPath));
  await fs.writeJson(settingsPath, settings, { spaces: 2 });
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown> | null> {
  if (!await fs.pathExists(filePath)) {
    return null;
  }

  try {
    const parsed = await fs.readJson(filePath) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

async function getManagedAgentSkillNames(repoRoot: string): Promise<Set<string>> {
  const candidates = [
    path.join(repoRoot, '.xtrm', 'skills', 'default'),
    path.resolve(__dirname, '..', '..', '.xtrm', 'skills', 'default'),
    path.resolve(__dirname, '..', '..', '..', '.xtrm', 'skills', 'default'),
  ];

  for (const candidate of candidates) {
    if (!await fs.pathExists(candidate)) {
      continue;
    }

    const entries = await fs.readdir(candidate);
    const managed = new Set<string>();

    for (const entry of entries) {
      const entryPath = path.join(candidate, entry);
      if ((await fs.stat(entryPath)).isDirectory()) {
        managed.add(entry);
      }
    }

    if (managed.size > 0) {
      return managed;
    }
  }

  return new Set<string>();
}
