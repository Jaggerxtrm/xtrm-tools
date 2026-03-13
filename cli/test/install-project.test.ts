import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fsExtra from 'fs-extra';
import {
    deepMergeHooks,
    extractReadmeDescription,
    getAvailableProjectSkills,
    installAllProjectSkills,
    installProjectSkill,
} from '../src/commands/install-project.js';

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
});

describe('extractReadmeDescription', () => {
    it('extracts the first prose line after the title', async () => {
        const readme = await fsExtra.readFile(
            path.join(__dirname, '../../project-skills/main-guard/README.md'),
            'utf8',
        );

        expect(extractReadmeDescription(readme)).toBe(
            'Git branch protection for Claude Code. Blocks direct edits to main/master branches and enforces feature branch workflow.',
        );
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
        await installProjectSkill('ts-quality-gate', tmpDir);

        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'quality-check.cjs'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'hook-config.json'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'skills', 'using-ts-quality-gate', 'SKILL.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'docs', 'ts-quality-gate-readme.md'))).toBe(true);
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

        await installProjectSkill('main-guard', tmpDir);

        const settings = await fsExtra.readJson(path.join(tmpDir, '.claude', 'settings.json'));
        expect(settings.hooks.PreToolUse).toHaveLength(2);
        expect(settings.hooks.CustomEvent).toEqual([{ command: 'echo keep-me' }]);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'main-guard.cjs'))).toBe(true);
    });

    it('installs Node hook files that execute inside type-module projects', async () => {
        await fsExtra.writeJson(path.join(tmpDir, 'package.json'), {
            name: 'esm-target',
            type: 'module',
        }, { spaces: 2 });

        await installProjectSkill('ts-quality-gate', tmpDir);
        await installProjectSkill('main-guard', tmpDir);

        const tsRun = spawnSync(
            'node',
            [path.join(tmpDir, '.claude', 'hooks', 'quality-check.cjs')],
            {
                cwd: tmpDir,
                input: '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/does-not-exist.ts"}}',
                encoding: 'utf8',
            },
        );
        expect(tsRun.status).toBe(0);

        const settings = await fsExtra.readJson(path.join(tmpDir, '.claude', 'settings.json'));
        const preToolUseCommand = settings.hooks.PreToolUse[0].hooks[0].command;
        expect(preToolUseCommand).toContain('main-guard.cjs');
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

    it('installs every available project skill with merged hooks and copied assets', async () => {
        const availableSkills = await getAvailableProjectSkills();
        expect(availableSkills).toEqual([
            'main-guard',
            'py-quality-gate',
            'service-skills-set',
            'tdd-guard',
            'ts-quality-gate',
        ]);

        await installAllProjectSkills(tmpDir);

        const settings = await fsExtra.readJson(path.join(tmpDir, '.claude', 'settings.json'));
        expect(settings.hooks.SessionStart).toHaveLength(2);
        expect(settings.hooks.PreToolUse).toHaveLength(3);
        expect(settings.hooks.PostToolUse).toHaveLength(3);
        expect(settings.hooks.UserPromptSubmit).toHaveLength(1);

        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'main-guard.cjs'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'quality-check.cjs'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'quality-check.py'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'git-hooks', 'doc_reminder.py'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'service-registry.json'))).toBe(true);

        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'skills', 'using-tdd-guard', 'SKILL.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'skills', 'using-ts-quality-gate', 'SKILL.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'skills', 'using-py-quality-gate', 'SKILL.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'skills', 'using-service-skills', 'SKILL.md'))).toBe(true);

        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'docs', 'tdd-guard-readme.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'docs', 'ts-quality-gate-readme.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'docs', 'py-quality-gate-readme.md'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'docs', 'service-skills-set-readme.md'))).toBe(true);
    });
});
