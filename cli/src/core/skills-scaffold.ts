import path from 'path';
import fs from 'fs-extra';
import kleur from 'kleur';

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
            console.log(kleur.yellow(`  ⚠ ${label} is a real directory — skipping symlink`));
            return;
        }
    }
    await fs.mkdirp(path.dirname(linkPath));
    await fs.symlink(symlinkTarget, linkPath);
    console.log(`${kleur.green('  ✓')} ${label} → ${symlinkTarget}`);
}

export async function ensureAgentsSkillsSymlink(projectRoot: string): Promise<void> {
    const sourceDir = path.join(projectRoot, '.xtrm', 'skills', 'default');
    if (!await fs.pathExists(sourceDir)) return;

    const xtrmTarget = path.join('..', '.xtrm', 'skills', 'default');

    // .agents/skills and .claude/skills both point at .xtrm/skills/default (real dir).
    // gitnexus analyze writes .xtrm/skills/default/gitnexus/ through the .claude/skills
    // symlink, coexisting with registry-managed skill files.
    await ensureSkillsSymlink(
        path.join(projectRoot, '.agents', 'skills'),
        xtrmTarget,
        '.agents/skills',
    );
    await ensureSkillsSymlink(
        path.join(projectRoot, '.claude', 'skills'),
        xtrmTarget,
        '.claude/skills',
    );
}
