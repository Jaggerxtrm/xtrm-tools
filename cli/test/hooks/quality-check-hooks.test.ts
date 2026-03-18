import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

describe('Quality check hooks graceful no-op', () => {
    it('quality-check.cjs exits 0 when tsconfig/tooling is absent', async () => {
        const temp = await mkdtemp(path.join(tmpdir(), 'xtrm-qg-node-'));
        try {
            await writeFile(path.join(temp, 'a.js'), 'const x = 1;\n', 'utf8');

            const nodeHookPath = path.resolve(__dirname, '../../../hooks/quality-check.cjs');
            const result = spawnSync('node', [nodeHookPath], {
                cwd: temp,
                encoding: 'utf8',
                input: JSON.stringify({ tool_input: { path: 'a.js' } }),
                env: { ...process.env, CLAUDE_PROJECT_DIR: temp },
            });

            expect(result.status).toBe(0);
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    });

    it('quality-check.py exits 0 when pyproject/.python-version is absent', async () => {
        const temp = await mkdtemp(path.join(tmpdir(), 'xtrm-qg-py-'));
        try {
            await writeFile(path.join(temp, 'a.py'), 'print("hello")\n', 'utf8');

            const pythonHookPath = path.resolve(__dirname, '../../../hooks/quality-check.py');
            const result = spawnSync('python3', [pythonHookPath], {
                cwd: temp,
                encoding: 'utf8',
                input: JSON.stringify({ tool_input: { path: 'a.py' } }),
                env: { ...process.env, CLAUDE_PROJECT_DIR: temp },
            });

            expect(result.status).toBe(0);
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    });
});
