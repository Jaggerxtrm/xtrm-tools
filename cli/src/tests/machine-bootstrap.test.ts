import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawnSync: mocked.spawnSync,
}));

describe('runMachineBootstrapPhase official plugin install', () => {
  beforeEach(() => {
    vi.resetModules();
    mocked.spawnSync.mockReset();
  });

  it('installs serena and context7 when missing', async () => {
    mocked.spawnSync.mockImplementation((command: string, args: string[]) => {
      const key = `${command} ${args.join(' ')}`;

      if (key === 'claude plugin list --json') {
        return { status: 0, stdout: '[]', stderr: '' };
      }

      if (key === 'claude plugin install serena --scope user') {
        return { status: 0, stdout: '', stderr: '' };
      }

      if (key === 'claude plugin install context7 --scope user') {
        return { status: 0, stdout: '', stderr: '' };
      }

      return { status: 0, stdout: 'ok', stderr: '' };
    });

    const { runMachineBootstrapPhase } = await import('../core/machine-bootstrap.js');
    await runMachineBootstrapPhase({ dryRun: false });

    const called = mocked.spawnSync.mock.calls.map(([cmd, args]) => `${cmd} ${(args as string[]).join(' ')}`);
    expect(called).toContain('claude plugin list --json');
    expect(called).toContain('claude plugin install serena --scope user');
    expect(called).toContain('claude plugin install context7 --scope user');
  });

  it('skips install when official plugins are already present', async () => {
    mocked.spawnSync.mockImplementation((command: string, args: string[]) => {
      const key = `${command} ${args.join(' ')}`;

      if (key === 'claude plugin list --json') {
        return {
          status: 0,
          stdout: JSON.stringify([
            { name: 'serena@claude-plugins-official' },
            { name: 'context7' },
          ]),
          stderr: '',
        };
      }

      return { status: 0, stdout: 'ok', stderr: '' };
    });

    const { runMachineBootstrapPhase } = await import('../core/machine-bootstrap.js');
    await runMachineBootstrapPhase({ dryRun: false });

    const called = mocked.spawnSync.mock.calls.map(([cmd, args]) => `${cmd} ${(args as string[]).join(' ')}`);
    expect(called).toContain('claude plugin list --json');
    expect(called.some(call => call.includes('claude plugin install serena'))).toBe(false);
    expect(called.some(call => call.includes('claude plugin install context7'))).toBe(false);
  });
});
