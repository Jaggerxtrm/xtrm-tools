import { Command } from 'commander';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import kleur from 'kleur';
import { findRepoRoot } from '../utils/repo-root.js';
import { sym } from '../utils/theme.js';

type Scope = 'global' | 'local';

type SkillEntry = {
  readonly name: string;
  readonly source: 'registry';
  readonly tier: 'default';
  readonly path: string;
};

function resolveScope(opts: { global?: boolean; local?: boolean }): Scope {
  if (opts.global && opts.local) {
    throw new Error('Choose exactly one scope: --global or --local');
  }

  return opts.global ? 'global' : 'local';
}

async function resolveScopeRoot(scope: Scope): Promise<string> {
  if (scope === 'global') {
    return os.homedir();
  }

  return findRepoRoot();
}

async function resolveDefaultSkillsRoot(scopeRoot: string): Promise<{ root: string; source: SkillEntry['source'] } | null> {
  const registryRoot = path.join(scopeRoot, '.xtrm', 'skills', 'default');
  if (!await fs.pathExists(registryRoot)) {
    return null;
  }

  return { root: registryRoot, source: 'registry' };
}

async function collectDefaultSkills(root: string, source: SkillEntry['source']): Promise<SkillEntry[]> {
  const names = await fs.readdir(root);
  const skills: SkillEntry[] = [];

  for (const name of names) {
    const skillPath = path.join(root, name);
    const stat = await fs.stat(skillPath).catch(() => null);
    if (!stat?.isDirectory()) {
      continue;
    }

    const skillFile = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillFile)) {
      continue;
    }

    skills.push({
      name,
      source,
      tier: 'default',
      path: skillPath,
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function printSkills(skills: readonly SkillEntry[]): void {
  if (skills.length === 0) {
    console.log(kleur.yellow('\n  No skills found.\n'));
    return;
  }

  for (const skill of skills) {
    console.log(`  ${kleur.bold(skill.name)}  ${kleur.gray(`[${skill.tier}]`)}  ${kleur.cyan(skill.source)}  ${kleur.dim(skill.path)}`);
  }

  console.log(`\n  ${sym.ok} ${skills.length} skill${skills.length === 1 ? '' : 's'}\n`);
}

function printPackStub(action: 'enable' | 'disable', pack: string): void {
  const verb = action === 'enable' ? 'Enabling' : 'Disabling';
  console.log(`\n  ${sym.warn} ${verb} pack '${pack}' is not available yet.`);
  console.log(kleur.gray('  Pack management is coming in v0.9.\n'));
}

export function createSkillsCommand(): Command {
  const skills = new Command('skills')
    .description('List installed skills and manage skill packs');

  skills
    .command('list')
    .description('Show installed skills with source and tier')
    .option('--global', 'Use user-global scope (~/.xtrm/skills)', false)
    .option('--local', 'Use project-local scope (./.xtrm/skills)', false)
    .option('--json', 'Output JSON', false)
    .action(async (opts: { global?: boolean; local?: boolean; json?: boolean }) => {
      try {
        const scope = resolveScope(opts);
        const scopeRoot = await resolveScopeRoot(scope);
        const resolvedRoot = await resolveDefaultSkillsRoot(scopeRoot);
        const skillsList = resolvedRoot ? await collectDefaultSkills(resolvedRoot.root, resolvedRoot.source) : [];

        if (opts.json) {
          console.log(JSON.stringify({
            scope,
            root: resolvedRoot?.root ?? null,
            source: resolvedRoot?.source ?? null,
            skills: skillsList,
          }, null, 2));
          return;
        }

        console.log(kleur.bold(`\n  xt skills list (${scope})\n`));
        printSkills(skillsList);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(kleur.red(`\n  ${sym.fail} ${msg}\n`));
        process.exit(1);
      }
    });

  skills
    .command('enable <pack>')
    .description('Enable a skill pack (stub in v0.8)')
    .option('--global', 'Use user-global scope (~/.xtrm/skills)', false)
    .option('--local', 'Use project-local scope (./.xtrm/skills)', false)
    .option('--json', 'Output JSON', false)
    .action(async (pack: string, opts: { global?: boolean; local?: boolean; json?: boolean }) => {
      try {
        const scope = resolveScope(opts);

        if (opts.json) {
          console.log(JSON.stringify({ scope, pack, action: 'enable', status: 'not-implemented', version: 'v0.8' }, null, 2));
          return;
        }

        printPackStub('enable', pack);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(kleur.red(`\n  ${sym.fail} ${msg}\n`));
        process.exit(1);
      }
    });

  skills
    .command('disable <pack>')
    .description('Disable a skill pack (stub in v0.8)')
    .option('--global', 'Use user-global scope (~/.xtrm/skills)', false)
    .option('--local', 'Use project-local scope (./.xtrm/skills)', false)
    .option('--json', 'Output JSON', false)
    .action(async (pack: string, opts: { global?: boolean; local?: boolean; json?: boolean }) => {
      try {
        const scope = resolveScope(opts);

        if (opts.json) {
          console.log(JSON.stringify({ scope, pack, action: 'disable', status: 'not-implemented', version: 'v0.8' }, null, 2));
          return;
        }

        printPackStub('disable', pack);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(kleur.red(`\n  ${sym.fail} ${msg}\n`));
        process.exit(1);
      }
    });

  return skills;
}
