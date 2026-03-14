import { Command } from 'commander';
import kleur from 'kleur';

import path from 'path';
import fs from 'fs-extra';
import { findRepoRoot } from '../utils/repo-root.js';

const HOOK_CATALOG: Array<{ file: string; event: string; desc: string; beads?: true }> = [
    { file: 'main-guard.mjs',               event: 'PreToolUse',       desc: 'Blocks direct edits on protected branches' },
    { file: 'skill-suggestion.py',           event: 'UserPromptSubmit', desc: 'Suggests relevant skills based on user prompt' },
    { file: 'serena-workflow-reminder.py',   event: 'SessionStart',     desc: 'Injects Serena semantic editing workflow reminder' },
    { file: 'type-safety-enforcement.py',    event: 'PreToolUse',       desc: 'Prevents risky Bash and enforces safe edit patterns' },
    { file: 'gitnexus/gitnexus-hook.cjs',    event: 'PreToolUse',       desc: 'Adds GitNexus context for Grep/Glob/Bash searches' },
    { file: 'skill-discovery.py',            event: 'UserPromptSubmit', desc: 'Discovers available skills for user requests' },
    { file: 'agent_context.py',              event: 'Support module',   desc: 'Shared hook I/O helper used by Python hook scripts' },
    { file: 'beads-edit-gate.mjs',           event: 'PreToolUse',       desc: 'Blocks file edits if no beads issue is claimed',      beads: true },
    { file: 'beads-commit-gate.mjs',         event: 'PreToolUse',       desc: 'Blocks commits when no beads issue is in progress',   beads: true },
    { file: 'beads-stop-gate.mjs',           event: 'Stop',             desc: 'Blocks session stop with an unclosed beads claim',    beads: true },
    { file: 'beads-close-memory-prompt.mjs', event: 'PostToolUse',      desc: 'Prompts memory save when closing a beads issue',      beads: true },
];

async function readSkillsFromDir(dir: string): Promise<Array<{ name: string; desc: string }>> {
    if (!(await fs.pathExists(dir))) return [];
    const entries = await fs.readdir(dir);
    const skills: Array<{ name: string; desc: string }> = [];
    for (const name of entries.sort()) {
        const skillMd = path.join(dir, name, 'SKILL.md');
        if (!(await fs.pathExists(skillMd))) continue;
        const content = await fs.readFile(skillMd, 'utf8');
        const m = content.match(/^description:\s*(.+)$/m);
        skills.push({ name, desc: m ? m[1].replace(/^["']|["']$/g, '').trim() : '' });
    }
    return skills;
}

function col(s: string, width: number): string {
    return s.length >= width ? s.slice(0, width - 1) + '\u2026' : s.padEnd(width);
}

export function createHelpCommand(): Command {
    return new Command('help')
        .description('Show help information and component catalogue')
        .action(async () => {
            let repoRoot: string;
            try { repoRoot = await findRepoRoot(); } catch { repoRoot = ''; }

            const skills = repoRoot ? await readSkillsFromDir(path.join(repoRoot, 'skills')) : [];
            const projectSkills = repoRoot ? await readSkillsFromDir(path.join(repoRoot, 'project-skills')) : [];

            const W = 80;
            const hr = kleur.dim('-'.repeat(W));
            const section = (title: string) => `\n${kleur.bold().cyan(title)}\n${hr}`;

            const installSection = [
                section('INSTALL COMMANDS'),
                '',
                `  ${kleur.bold('xtrm install all')}`,
                `    ${kleur.dim('Global install: skills + all hooks (including beads gates) + MCP servers.')}`,
                `    ${kleur.dim('Checks for beads+dolt and prompts to install if missing.')}`,
                '',
                `  ${kleur.bold('xtrm install basic')}`,
                `    ${kleur.dim('Global install: skills + general hooks + MCP servers.')}`,
                `    ${kleur.dim('No beads dependency -- safe to run with zero external deps.')}`,
                '',
                `  ${kleur.bold('xtrm install project')} ${kleur.dim('<tool-name | all>')}`,
                `    ${kleur.dim('Project-scoped install into .claude/ of current git root.')}`,
                `    ${kleur.dim('Run xtrm install project list to see available project skills.')}`,
                '',
                `  ${kleur.dim('Default target directories:')}`,
                `    ${kleur.dim('~/.claude/hooks     (global hook scripts)')}`,
                `    ${kleur.dim('~/.claude/skills    (global Claude skills)')}`,
                `    ${kleur.dim('~/.agents/skills    (agents skills cache mirror)')}`,
                '',
                `  ${kleur.dim('Flags (all profiles): --dry-run  --yes / -y  --no-mcp  --force  --prune  --backport')}`,
            ].join('\n');

            const general = HOOK_CATALOG.filter(h => !h.beads);
            const beads   = HOOK_CATALOG.filter(h => h.beads);
            const hookRows = (hooks: typeof HOOK_CATALOG) =>
                hooks.map(h =>
                    `  ${kleur.white(col(h.file, 34))}${kleur.yellow(col(h.event, 20))}${kleur.dim(h.desc)}`
                ).join('\n');

            const hooksSection = [
                section('GLOBAL HOOKS'),
                '',
                kleur.dim('  ' + col('File', 34) + col('Event', 20) + 'Description'),
                '',
                hookRows(general),
                '',
                `  ${kleur.dim('beads gate hooks (xtrm install all -- require beads+dolt):')}`,
                hookRows(beads),
            ].join('\n');

            const skillRows = skills.map(s => {
                const desc = s.desc.length > 46 ? s.desc.slice(0, 45) + '\u2026' : s.desc;
                return `  ${kleur.white(col(s.name, 30))}${kleur.dim(desc)}`;
            }).join('\n');

            const skillsSection = [
                section(`SKILLS  ${kleur.dim('(' + skills.length + ' available)')}`),
                '',
                skills.length ? skillRows : kleur.dim('  (none found -- run from repo root to see skills)'),
            ].join('\n');

            const psRows = projectSkills.map(s =>
                `  ${kleur.white(col(s.name, 30))}${kleur.dim(s.desc)}`
            ).join('\n');

            const psSection = [
                section('PROJECT SKILLS'),
                '',
                projectSkills.length ? psRows : kleur.dim('  (none found)'),
                '',
                `  ${kleur.dim('Install: xtrm install project <name>  |  xtrm install project list')}`,
            ].join('\n');

            const otherSection = [
                section('OTHER COMMANDS'),
                '',
                `  ${kleur.bold('xtrm status')}    ${kleur.dim('Show pending changes without applying them')}`,
                `  ${kleur.bold('xtrm reset')}     ${kleur.dim('Clear saved preferences and start fresh')}`,
                `  ${kleur.bold('xtrm help')}      ${kleur.dim('Show this overview')}`,
            ].join('\n');

            const resourcesSection = [
                section('RESOURCES'),
                '',
                `  Repository  https://github.com/Jaggerxtrm/xtrm-tools`,
                `  Issues      https://github.com/Jaggerxtrm/xtrm-tools/issues`,
                '',
                `  ${kleur.dim("Run 'xtrm <command> --help' for command-specific options.")}`,
                '',
            ].join('\n');

            console.log([installSection, hooksSection, skillsSection, psSection, otherSection, resourcesSection].join('\n'));
        });
}
