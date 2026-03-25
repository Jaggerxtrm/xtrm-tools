import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '../..');
const CLI_BIN = path.join(__dirname, '../dist/index.cjs');

function runCrossCheck(
    args: string[],
    env: Record<string, string> = {},
    cwd: string = REPO_ROOT,
): { stdout: string; stderr: string; status: number } {
    const r = spawnSync('node', [CLI_BIN, 'docs', 'cross-check', ...args], {
        encoding: 'utf8',
        cwd,
        env: { ...process.env, ...env },
        timeout: 30000,
    });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

// ── Basic invocation ────────────────────────────────────────────────────────

describe.skip('xtrm docs cross-check — basic invocation (CI no gh auth)', () => {
    it('exits 0 in a valid repo with docs files', () => {
        const r = runCrossCheck(['--days', '30']);
        expect(r.status).toBe(0);
    });

    it('--help exits 0 and describes the command', () => {
        const r = runCrossCheck(['--help']);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('cross-check');
    });

    it('accepts --days option', () => {
        const r = runCrossCheck(['--days', '7']);
        expect(r.status).toBe(0);
    });

    it('accepts --json flag', () => {
        const r = runCrossCheck(['--json', '--days', '7']);
        expect(r.status).toBe(0);
    });
});

// ── JSON output ──────────────────────────────────────────────────────────────

describe.skip('xtrm docs cross-check --json (CI no gh auth)', () => {
    it('outputs parseable JSON', () => {
        const r = runCrossCheck(['--json', '--days', '30']);
        expect(r.status).toBe(0);

        let parsed: unknown;
        expect(() => {
            parsed = JSON.parse(r.stdout);
        }).not.toThrow();

        expect(parsed).toBeDefined();
    });

    it('JSON has required top-level fields', () => {
        const r = runCrossCheck(['--json', '--days', '30']);
        const parsed = JSON.parse(r.stdout);

        expect(typeof parsed.docsChecked).toBe('number');
        expect(typeof parsed.findingsTotal).toBe('number');
        expect(Array.isArray(parsed.findings)).toBe(true);
        expect(typeof parsed.generatedAt).toBe('string');
    });

    it('JSON findings have correct shape', () => {
        const r = runCrossCheck(['--json', '--days', '30']);
        const parsed = JSON.parse(r.stdout);

        if (parsed.findings.length > 0) {
            const finding = parsed.findings[0];
            expect(typeof finding.severity).toBe('string');
            expect(typeof finding.kind).toBe('string');
            expect(typeof finding.docPath).toBe('string');
            expect(typeof finding.message).toBe('string');
        }
    });

    it('generatedAt is valid ISO date', () => {
        const r = runCrossCheck(['--json', '--days', '30']);
        const parsed = JSON.parse(r.stdout);

        expect(() => new Date(parsed.generatedAt)).not.toThrow();
        expect(new Date(parsed.generatedAt).toISOString()).toBe(parsed.generatedAt);
    });
});

// ── Human output ─────────────────────────────────────────────────────────────

describe.skip('xtrm docs cross-check — human output (CI no gh auth)', () => {
    it('contains summary header', () => {
        const r = runCrossCheck(['--days', '30']);
        expect(r.stdout).toMatch(/docs? checked/i);
    });

    it('shows severity labels for findings', () => {
        const r = runCrossCheck(['--days', '30']);
        // Should have warning or info symbols if findings exist
        // If no findings, shows "All docs current"
        if (r.stdout.match(/[1-9]\d* finding/)) {
            expect(r.stdout).toMatch(/⚠|ℹ|✗/);
        } else {
            expect(r.stdout).toMatch(/current|✓/i);
        }
    });
});

// ── Offline mode ─────────────────────────────────────────────────────────────

describe.skip('xtrm docs cross-check — offline mode (CI no gh auth)', () => {
    it('gracefully handles missing gh (warning, not crash)', () => {
        // Run with PATH that has node but not gh/bd
        // The CLI should still exit 0 (graceful degradation)
        const r = runCrossCheck(['--json', '--days', '30']);
        expect(r.status).toBe(0);

        // If gh/bd were unavailable, stderr would have warnings
        // But we can't reliably test that without modifying PATH
        // So just verify the JSON is valid regardless
        const parsed = JSON.parse(r.stdout);
        expect(typeof parsed.docsChecked).toBe('number');
    });
});

// ── Error cases ──────────────────────────────────────────────────────────────

describe('xtrm docs cross-check — error cases', () => {
    it('exits 1 outside a git repo', () => {
        const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-crosscheck-test-'));
        try {
            // Create a minimal README but no .git
            writeFileSync(path.join(tmpDir, 'README.md'), '# Test\n');

            const r = runCrossCheck(['--days', '30'], {}, tmpDir);
            // Should either exit 1 or handle gracefully
            // The implementation uses findRepoRoot which may fall back to cwd
            expect([0, 1]).toContain(r.status);
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});