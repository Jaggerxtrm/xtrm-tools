import path from 'path';
import fs from 'fs-extra';
import kleur from 'kleur';
import { rebuildAllRuntimeActiveViews } from './skills-materializer.js';
import { resolveSkillsRoot } from './skills-layout.js';
import { validateSkillsInvariants } from './skill-discovery.js';

export async function ensureSkillsSymlink(
    linkPath: string,
    symlinkTarget: string,
    label: string,
): Promise<void> {
    const existing = await fs.lstat(linkPath).catch(() => null);
    if (existing) {
        if (existing.isSymbolicLink()) {
            const current = await fs.readlink(linkPath);
            if (current === symlinkTarget) {
                console.log(kleur.dim(`  ✓ ${label} symlink already in place`));
                return;
            }
            await fs.remove(linkPath);
        } else {
            await fs.remove(linkPath);
            console.log(kleur.yellow(`  ⚠ ${label} was a real path — replaced with managed symlink`));
        }
    }
    await fs.mkdirp(path.dirname(linkPath));
    await fs.symlink(symlinkTarget, linkPath);
    console.log(`${kleur.green('  ✓')} ${label} → ${symlinkTarget}`);
}

export async function ensureAgentsSkillsSymlink(projectRoot: string): Promise<void> {
    const skillsRoot = resolveSkillsRoot(projectRoot);
    if (!await fs.pathExists(path.join(skillsRoot, 'default'))) return;

    const invariantViolations = await validateSkillsInvariants(skillsRoot);
    if (invariantViolations.length > 0) {
        const summary = invariantViolations.map(violation => `${violation.code}: ${violation.message}`).join('; ');
        throw new Error(`Skills invariants failed. ${summary}`);
    }

    await rebuildAllRuntimeActiveViews(skillsRoot);

    await ensureSkillsSymlink(
        path.join(projectRoot, '.claude', 'skills'),
        path.join('..', '.xtrm', 'skills', 'active', 'claude'),
        '.claude/skills',
    );

    const agentsSkillsPath = path.join(projectRoot, '.agents', 'skills');
    if (await fs.pathExists(agentsSkillsPath)) {
        console.log(kleur.dim('  ○ .agents/skills is deprecated; runtime skills are generated under .xtrm/skills/active/*'));
    }
}
