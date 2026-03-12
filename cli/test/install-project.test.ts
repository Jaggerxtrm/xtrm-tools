import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fsExtra from 'fs-extra';
import { deepMergeHooks, extractReadmeDescription, installProjectSkill } from '../src/commands/install-project.js';

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

        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'quality-check.js'))).toBe(true);
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
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'hooks', 'main-guard.js'))).toBe(true);
    });
});
