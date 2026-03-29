import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const mocked = vi.hoisted(() => {
    const runInstall = vi.fn(async () => undefined);
    const runMachineBootstrap = vi.fn(async () => undefined);
    const getContext = vi.fn(async () => ({ targets: ['/tmp/.agents/skills'], syncMode: 'sync' }));
    const calculateDiff = vi.fn(async () => ({
        skills: { missing: ['a'], outdated: ['b'], drifted: [] },
    }));
    const findRepoRoot = vi.fn(async () => '/tmp/repo-root');
    const prompts = vi.fn(async () => ({ confirm: true }));
    const spawnSync = vi.fn();
    return {
        runInstall,
        runMachineBootstrap,
        getContext,
        calculateDiff,
        findRepoRoot,
        prompts,
        spawnSync,
    };
});

vi.mock('../src/commands/install.js', () => ({
    runInstall: mocked.runInstall,
    runMachineBootstrap: mocked.runMachineBootstrap,
    isBeadsInstalled: vi.fn(() => true),
    isDoltInstalled: vi.fn(() => true),
    isBvInstalled: vi.fn(() => true),
    isDeepwikiInstalled: vi.fn(() => true),
}));

vi.mock('../src/core/context.js', () => ({
    getContext: mocked.getContext,
}));

vi.mock('../src/core/diff.js', () => ({
    calculateDiff: mocked.calculateDiff,
}));

vi.mock('../src/utils/repo-root.js', () => ({
    findRepoRoot: mocked.findRepoRoot,
}));

vi.mock('prompts', () => ({
    default: mocked.prompts,
}));

vi.mock('child_process', () => ({
    spawnSync: mocked.spawnSync,
}));

function setupSpawnSync(projectRoot: string, calls: string[]): void {
    mocked.spawnSync.mockImplementation((command: string, args: string[] = [], options: any = {}) => {
        const key = `${command} ${args.join(' ')}`.trim();

        if (key === 'git rev-parse --show-toplevel') {
            return { status: 0, stdout: `${projectRoot}\n`, stderr: '' };
        }

        if (key === 'gitnexus status') {
            return { status: 1, stdout: 'not indexed', stderr: '' };
        }

        if (key === 'gitnexus --version') {
            return { status: 0, stdout: 'gitnexus 1.0.0', stderr: '' };
        }

        if (key === 'gitnexus analyze') {
            calls.push('gitnexus analyze');
            return { status: 0, stdout: 'indexed', stderr: '' };
        }

        if (key === 'bd init') {
            calls.push('bd init');
            return { status: 0, stdout: 'initialized', stderr: '' };
        }

        throw new Error(`Unexpected spawnSync call: ${key} cwd=${options?.cwd ?? ''}`);
    });
}

describe('xtrm init phased orchestrator', () => {
    let projectRoot: string;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
    let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
    let logs: string[];

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        logs = [];
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xtrm-init-project-'));
        await fs.writeFile(path.join(projectRoot, 'tsconfig.json'), '{}');

        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
            logs.push(args.join(' '));
        });
        stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
        stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any);
    });

    afterEach(async () => {
        consoleLogSpy.mockRestore();
        stdoutWriteSpy.mockRestore();
        stderrWriteSpy.mockRestore();
        await fs.remove(projectRoot);
    });

    it('renders the plan and stops before mutation in dry-run mode', async () => {
        const calls: string[] = [];
        setupSpawnSync(projectRoot, calls);
        mocked.prompts.mockResolvedValue({ confirm: true });

        const { runProjectInit } = await import('../src/commands/init.js?t=dryrun-' + Date.now());
        await runProjectInit({ dryRun: true });

        expect(logs.join('\n')).toContain('xtrm init — Installation Plan');
        expect(logs.join('\n')).toContain('Dry run — no changes written');
        expect(mocked.prompts).not.toHaveBeenCalled();
        expect(mocked.runMachineBootstrap).not.toHaveBeenCalled();
        expect(mocked.runInstall).not.toHaveBeenCalled();
        expect(calls).toEqual([]);
    });

    it('respects the single confirmation gate before running mutating phases', async () => {
        const calls: string[] = [];
        setupSpawnSync(projectRoot, calls);
        mocked.prompts.mockResolvedValue({ confirm: false });

        const { runProjectInit } = await import('../src/commands/init.js?t=cancel-' + Date.now());
        await runProjectInit();

        expect(mocked.prompts).toHaveBeenCalledTimes(1);
        expect(logs.join('\n')).toContain('Init cancelled.');
        expect(mocked.runMachineBootstrap).not.toHaveBeenCalled();
        expect(mocked.runInstall).not.toHaveBeenCalled();
        expect(calls).toEqual([]);
    });

    it('runs machine bootstrap before runtime sync and project bootstrap', async () => {
        const calls: string[] = [];
        setupSpawnSync(projectRoot, calls);
        mocked.runMachineBootstrap.mockImplementation(async () => {
            calls.push('runMachineBootstrap');
        });
        mocked.runInstall.mockImplementation(async () => {
            calls.push('runInstall');
        });

        const { runProjectInit } = await import('../src/commands/init.js?t=ordered-' + Date.now());
        await runProjectInit({ yes: true });

        expect(mocked.prompts).not.toHaveBeenCalled();
        expect(mocked.runMachineBootstrap).toHaveBeenCalledWith({ yes: true });
        expect(mocked.runInstall).toHaveBeenCalledWith(expect.objectContaining({
            yes: true,
            backport: false,
            skipMachineBootstrap: true,
        }));
        expect(calls).toEqual(['runMachineBootstrap', 'runInstall', 'bd init', 'gitnexus analyze']);
        expect(logs.join('\n')).toContain('Project initialized.');
    });
});
