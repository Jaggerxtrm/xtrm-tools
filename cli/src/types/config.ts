import { z } from 'zod';

export const SyncModeSchema = z.enum(['copy', 'symlink', 'prune']);
export type SyncMode = z.infer<typeof SyncModeSchema>;

export const TargetConfigSchema = z.strictObject({
  label: z.string({ error: 'Target label is required' }).min(1, { error: 'Target label is required' }),
  path: z.string({ error: 'Target path is required' }).min(1, { error: 'Target path is required' }),
  exists: z.boolean({ error: 'Target exists flag must be a boolean' }),
});
export type TargetConfig = z.infer<typeof TargetConfigSchema>;

export const ChangeSetCategorySchema = z.strictObject({
  missing: z.array(z.string(), { error: 'Missing items must be a string array' }),
  outdated: z.array(z.string(), { error: 'Outdated items must be a string array' }),
  drifted: z.array(z.string(), { error: 'Drifted items must be a string array' }),
  total: z.number({ error: 'Category total must be a number' }),
});
export type ChangeSetCategory = z.infer<typeof ChangeSetCategorySchema>;

export const ChangeSetSchema = z.strictObject({
  skills: ChangeSetCategorySchema,
  hooks: ChangeSetCategorySchema,
  config: ChangeSetCategorySchema,
  commands: ChangeSetCategorySchema,
});
export type ChangeSet = z.infer<typeof ChangeSetSchema>;

export const SyncPlanSchema = z.strictObject({
  mode: SyncModeSchema,
  targets: z.array(z.string(), { error: 'Sync targets must be a string array' }),
});
export type SyncPlan = z.infer<typeof SyncPlanSchema>;

export const ManifestItemSchema = z.strictObject({
  type: z.enum(['skill', 'hook', 'config', 'command']),
  name: z.string({ error: 'Manifest item name is required' }).min(1, { error: 'Manifest item name is required' }),
  hash: z.string({ error: 'Manifest item hash is required' }).min(1, { error: 'Manifest item hash is required' }),
  lastSync: z.string({ error: 'Manifest item lastSync is required' }).min(1, { error: 'Manifest item lastSync is required' }),
  source: z.string({ error: 'Manifest item source is required' }).min(1, { error: 'Manifest item source is required' }),
});
export type ManifestItem = z.infer<typeof ManifestItemSchema>;

export const ManifestSchema = z.strictObject({
  version: z.string({ error: 'Manifest version must be a string' }).optional().default('1'),
  lastSync: z.string({ error: 'Manifest lastSync is required' }).min(1, { error: 'Manifest lastSync is required' }),
  items: z.number({ error: 'Manifest item count must be a number' }).optional().default(0),
});
export type Manifest = z.infer<typeof ManifestSchema>;
