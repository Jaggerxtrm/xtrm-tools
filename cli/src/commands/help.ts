import { Command } from 'commander';
import kleur from 'kleur';

import path from 'path';
import fs from 'fs-extra';
import { findRepoRoot } from '../utils/repo-root.js';
declare const __dirname: string;

const HOOK_CATALOG: Array<{ file: string; event: string; desc: string; beads?: true; sessionFlow?: true }> = [
    { file: 'using-xtrm-reminder.mjs',      event: 'SessionStart',     desc: 'Injects using-xtrm session operating manual into system prompt' },
    { file: 'serena-workflow-reminder.py',  event: 'SessionStart',     desc: 'Injects Serena semantic editing workflow reminder' },
    { file: 'gitnexus/gitnexus-hook.cjs',   event: 'PostToolUse',      desc: 'Adds GitNexus context for search and Serena tooling' },
    { file: 'branch-state.mjs',             event: 'UserPromptSubmit', desc: 'Injects current git branch into prompt context' },
    { file: 'quality-check.cjs',            event: 'PostToolUse',      desc: 'Runs JS/TS quality checks on mutating edits' },
    { file: 'quality-check.py',             event: 'PostToolUse',      desc: 'Runs Python quality checks on mutating edits' },
    { file: 'beads-edit-gate.mjs',          event: 'PreToolUse',       desc: 'Blocks file edits if no beads issue is claimed',           beads: true },
    { file: 'beads-commit-gate.mjs',        event: 'PreToolUse',       desc: 'Blocks commits when no beads issue is in progress',        beads: true },
    { file: 'beads-stop-gate.mjs',          event: 'Stop',             desc: 'Blocks stop when there is an unclosed in_progress claim',  beads: true },
    { file: 'beads-memory-gate.mjs',        event: 'Stop',             desc: 'Prompts memory save when claim was closed this session',   beads: true },
    { file: 'beads-compact-save.mjs',       event: 'PreCompact',       desc: 'Saves claim state across /compact',                        beads: true },
    { file: 'beads-compact-restore.mjs',    event: 'SessionStart',     desc: 'Restores claim state after /compact',                      beads: true },
    { file: 'beads-claim-sync.mjs',         event: 'PostToolUse',      desc: 'Notifies on bd update --claim; auto-commits on bd close',  sessionFlow: true },
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

async function readProjectSkillsFromDir(dir: string): Promise<Array<{ name: string; desc: string }>> {
    if (!(await fs.pathExists(dir))) return [];
    const entries = await fs.readdir(dir);
    const skills: Array<{ name: string; desc: string }> = [];
    for (const name of entries.sort()) {
        const readme = path.join(dir, name, 'README.md');
        if (!(await fs.pathExists(readme))) continue;
        const content = await fs.readFile(readme, 'utf8');
        const descLine = content.split('\n').find(line => {
            const trimmed = line.trim();
            return Boolean(trimmed) && !trimmed.startsWith('#') && !trimmed.startsWith('[') && !trimmed.startsWith('<');
        }) || '';
        skills.push({ name, desc: descLine.replace(/[*_`]/g, '').trim() });
    }
    return skills;
}

function resolvePkgRootFallback(): string | null {
    const candidates = [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../..'),
    ];
    const match = candidates.find(candidate =>
        fs.existsSync(path.join(candidate, 'skills')) || fs.existsSync(path.join(candidate, 'project-skills'))
    );
    return match || null;
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
            const pkgRoot = resolvePkgRootFallback();

            const skillsRoot = repoRoot || pkgRoot || '';
            const projectSkillsRoot = repoRoot || pkgRoot || '';
            const skills = skillsRoot ? await readSkillsFromDir(path.join(skillsRoot, 'skills')) : [];
            const projectSkills = projectSkillsRoot ? await readProjectSkillsFromDir(path.join(projectSkillsRoot, 'project-skills')) : [];

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

            const general = HOOK_CATALOG.filter(h => !h.beads && !h.sessionFlow);
            const beads = HOOK_CATALOG.filter(h => h.beads);
            const sessionFlow = HOOK_CATALOG.filter(h => h.sessionFlow);
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
                '',
                `  ${kleur.dim('session-flow hooks:')}`,
                hookRows(sessionFlow),
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
                section('PROJECT SKILLS + HOOKS'),
                '',
                projectSkills.length ? psRows : kleur.dim('  (none found in package)'),
                '',
                `  ${kleur.dim('Install: xtrm install project <name>  |  xtrm install project list')}`,
                `  ${kleur.dim('Each project skill can install .claude/skills plus project hooks/settings.')}`,
            ].join('\n');

            const otherSection = [
                section('OTHER COMMANDS'),
                '',
                `  ${kleur.bold('xtrm status')}          ${kleur.dim('Show pending changes without applying them')}`,
                `  ${kleur.bold('xtrm clean')}           ${kleur.dim('Remove orphaned hooks and skills not in canonical repo')}`,
                `  ${kleur.bold('xtrm init')}            ${kleur.dim('Initialize project data (beads, gitnexus, service-registry)')}`,
                `  ${kleur.bold('xtrm reset')}           ${kleur.dim('Clear saved preferences and start fresh')}`,
                `  ${kleur.bold('xtrm end')}             ${kleur.dim('Close worktree session: rebase, push, PR, link issues, cleanup')}`,
                `  ${kleur.bold('xtrm worktree list')}   ${kleur.dim('List all active xt/* worktrees with status')}`,
                `  ${kleur.bold('xtrm worktree clean')}  ${kleur.dim('Remove worktrees whose branch has been merged into main')}`,
                `  ${kleur.bold('xtrm help')}            ${kleur.dim('Show this overview')}`,
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
