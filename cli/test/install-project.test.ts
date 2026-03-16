import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fsExtra from 'fs-extra';
import {
    buildProjectInitGuide,
    createProjectCommand,
    deepMergeHooks,
    extractReadmeDescription,
    getAvailableProjectSkills,
    installAllProjectSkills,
    installProjectSkill,
    upsertManagedBlock,
} from '../src/commands/install-project.js';

describe('buildProjectInitGuide', () => {
    it('includes complete onboarding guidance (quality gates, beads workflow, and git workflow)', () => {
        const guide = buildProjectInitGuide();
        expect(guide).toContain('quality-gates');
        expect(guide).toContain('tdd-guard');
        expect(guide).toContain('service-skills-set');
        expect(guide.toLowerCase()).toContain('beads workflow');
        expect(guide).toContain('bd ready --json');
        expect(guide).toContain('gh pr create --fill');
        expect(guide.toLowerCase()).toContain('service-skills-set');
    });
});

describe('createProjectCommand', () => {
    it('exposes init/list/install subcommands', () => {
        const cmd = createProjectCommand();
        const names = cmd.commands.map(c => c.name());
        expect(names).toEqual(expect.arrayContaining(['init', 'list', 'install']));
    });
});

describe('deepMergeHooks', () => {
    it('appends new hook entries without overwriting existing events', () => {
        const existing = {
            hooks: {
                PreToolUse: [{ command: 'echo existing-pre' }],
                CustomEvent: [{ command: 'echo keep-me' }],
            },
        };

        const incoming = {
            hooks: {
                PreToolUse: [{ command: 'echo new-pre' }],
                PostToolUse: [{ command: 'echo new-post' }],
            },
        };

        const merged = deepMergeHooks(existing, incoming);

        expect(merged.hooks.PreToolUse).toEqual([
            { command: 'echo existing-pre' },
            { command: 'echo new-pre' },
        ]);
        expect(merged.hooks.CustomEvent).toEqual([{ command: 'echo keep-me' }]);
        expect(merged.hooks.PostToolUse).toEqual([{ command: 'echo new-post' }]);
    });

    it('upgrades existing same-command matcher to include incoming Serena tools', () => {
        const existing = {
            hooks: {
                PostToolUse: [{
                    matcher: 'Write|Edit|MultiEdit',
                    hooks: [{ command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/quality-check.cjs"' }],
                }],
            },
        };

        const incoming = {
            hooks: {
                PostToolUse: [{
                    matcher: 'Write|Edit|MultiEdit|mcp__serena__rename_symbol|mcp__serena__replace_symbol_body|mcp__serena__insert_after_symbol|mcp__serena__insert_before_symbol',
                    hooks: [{ command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/quality-check.cjs"' }],
                }],
            },
        };

        const merged = deepMergeHooks(existing, incoming);
        const matcher = merged.hooks.PostToolUse[0].matcher as string;
        expect(matcher).toContain('mcp__serena__rename_symbol');
        expect(matcher).toContain('mcp__serena__replace_symbol_body');
        expect(matcher).toContain('mcp__serena__insert_after_symbol');
        expect(matcher).toContain('mcp__serena__insert_before_symbol');
    });

    it('upgrades matcher when command path differs but hook script is the same', () => {
        const existing = {
            hooks: {
                PostToolUse: [{
                    matcher: 'Write|Edit|MultiEdit',
                    hooks: [{ command: 'python3 "$CLAUDE_PROJECT_DIR/hooks/quality-check.py"' }],
                }],
            },
        };

        const incoming = {
            hooks: {
                PostToolUse: [{
                    matcher: 'Write|Edit|MultiEdit|mcp__serena__rename_symbol|mcp__serena__replace_symbol_body|mcp__serena__insert_after_symbol|mcp__serena__insert_before_symbol',
                    hooks: [{ command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/quality-check.py"' }],
                }],
            },
        };

        const merged = deepMergeHooks(existing, incoming);
        expect(merged.hooks.PostToolUse).toHaveLength(1);
        const matcher = merged.hooks.PostToolUse[0].matcher as string;
        expect(matcher).toContain('mcp__serena__rename_symbol');
        expect(matcher).toContain('mcp__serena__replace_symbol_body');
        expect(matcher).toContain('mcp__serena__insert_after_symbol');
        expect(matcher).toContain('mcp__serena__insert_before_symbol');
    });
});


describe('upsertManagedBlock', () => {
    it('prepends managed block when no block exists', () => {
        const input = `# Existing

content`;
        const result = upsertManagedBlock(input, '# Header');

        expect(result).toContain('<!-- xtrm:start -->');
        expect(result).toContain('# Header');
        expect(result).toContain('<!-- xtrm:end -->');
        expect(result.endsWith('content')).toBe(true);
    });

    it('replaces existing managed block in place', () => {
        const input = [
            '<!-- xtrm:start -->',
            'old',
            '<!-- xtrm:end -->',
            '',
            '# Existing',
        ].join('\n');

        const result = upsertManagedBlock(input, '# New Header');

        expect(result).toContain('# New Header');
        expect(result).not.toContain('\nold\n');
        expect(result).toContain('# Existing');
        expect((result.match(/<!-- xtrm:start -->/g) || []).length).toBe(1);
    });

    it('is idempotent for identical content', () => {
        const input = '# Existing\n';
        const first = upsertManagedBlock(input, '# Header');
        const second = upsertManagedBlock(first, '# Header');
        expect(second).toBe(first);
    });
});

describe('extractReadmeDescription', () => {
    it('extracts the first prose line after the title', async () => {
        const readme = await fsExtra.readFile(
            path.join(__dirname, '../../project-skills/quality-gates/README.md'),
            'utf8',
        );

        const description = extractReadmeDescription(readme);
        expect(description).toBeTruthy();
        expect(description).not.toBe('No description available');
    });

    it('skips badge blocks and finds the first actual description line', async () => {
        const readme = await fsExtra.readFile(
            path.join(__dirname, '../../project-skills/tdd-guard/README.md'),
            'utf8',
        );

        expect(extractReadmeDescription(readme)).toBe(
            'Automated Test-Driven Development enforcement for Claude Code.',
        );
    });
});

describe('installProjectSkill', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(tmpdir(), 'xtrm-project-skill-'));
        await fsExtra.ensureDir(path.join(tmpDir, '.claude'));
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('copies hook assets required by the installed project skill', async () => {
        await installProjectSkill('tdd-guard', tmpDir);

        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'tdd-guard-pretool-bridge.cjs'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'skills', 'using-tdd-guard', 'SKILL.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'docs', 'tdd-guard-readme.md'))).toBe(true);
    });

    it('merges settings without dropping existing project hooks', async () => {
        await fsExtra.writeJson(
            path.join(tmpDir, '.claude', 'settings.json'),
            {
                hooks: {
                    PreToolUse: [{ command: 'echo existing-pre' }],
                    CustomEvent: [{ command: 'echo keep-me' }],
                },
            },
            { spaces: 2 },
        );

        await installProjectSkill('tdd-guard', tmpDir);

        const settings = await fsExtra.readJson(path.join(tmpDir, '.claude', 'settings.json'));
        expect(settings.hooks.PreToolUse).toHaveLength(2);
        expect(settings.hooks.CustomEvent).toEqual([{ command: 'echo keep-me' }]);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'tdd-guard-pretool-bridge.cjs'))).toBe(true);
    });

    it('installs Node hook files that execute inside type-module projects', async () => {
        await fsExtra.writeJson(path.join(tmpDir, 'package.json'), {
            name: 'esm-target',
            type: 'module',
        }, { spaces: 2 });

        await installProjectSkill('tdd-guard', tmpDir);

        const guardRun = spawnSync(
            'node',
            [path.join(tmpDir, '.claude', 'hooks', 'tdd-guard-pretool-bridge.cjs')],
            {
                cwd: tmpDir,
                input: '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/does-not-exist.ts"}}',
                encoding: 'utf8',
            },
        );
        expect(guardRun.status).toBe(0);

        const settings = await fsExtra.readJson(path.join(tmpDir, '.claude', 'settings.json'));
        const preToolUseCommand = settings.hooks.PreToolUse[0].hooks[0].command;
        expect(preToolUseCommand).toContain('tdd-guard-pretool-bridge.cjs');
    });

    it('installs service-skills git hooks when service-skills-set is installed', async () => {
        await fsExtra.ensureDir(path.join(tmpDir, '.git', 'hooks'));
        await installProjectSkill('service-skills-set', tmpDir);

        expect(await fsExtra.pathExists(path.join(tmpDir, '.githooks', 'pre-commit'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.githooks', 'pre-push'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.git', 'hooks', 'pre-commit'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.git', 'hooks', 'pre-push'))).toBe(true);
    });
});

describe('installAllProjectSkills', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(tmpdir(), 'xtrm-project-skill-all-'));
        await fsExtra.ensureDir(path.join(tmpDir, '.claude'));
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('getAvailableProjectSkills only returns skills with a .claude directory', async () => {
        const availableSkills = await getAvailableProjectSkills();
        // All returned skills must have a .claude dir (eval-only dirs are excluded)
        for (const skill of availableSkills) {
            expect(availableSkills).toContain(skill);
        }
        expect(availableSkills).toContain('tdd-guard');
        expect(availableSkills).toContain('service-skills-set');
        expect(availableSkills).toContain('quality-gates');
    });

    it('installs every available project skill with merged hooks and copied assets', async () => {
        const availableSkills = await getAvailableProjectSkills();
        expect(availableSkills).toEqual([
            'quality-gates',
            'service-skills-set',
            'tdd-guard',
        ]);

        await installAllProjectSkills(tmpDir);

        const settings = await fsExtra.readJson(path.join(tmpDir, '.claude', 'settings.json'));
        expect(settings.hooks.PreToolUse).toHaveLength(1);   // tdd-guard

        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'quality-check.cjs'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'git-hooks', 'doc_reminder.py'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'service-registry.json'))).toBe(true);

        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'skills', 'using-tdd-guard', 'SKILL.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'skills', 'using-service-skills', 'SKILL.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'skills', 'using-quality-gates', 'SKILL.md'))).toBe(true);

        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'docs', 'tdd-guard-readme.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'docs', 'service-skills-set-readme.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'docs', 'quality-gates-readme.md'))).toBe(true);
    });
});
