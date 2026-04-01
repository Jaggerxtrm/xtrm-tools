import path from 'path';
import os from 'os';
import { describe, expect, it } from 'vitest';
import { getCandidatePaths } from '../src/core/context.js';

describe('getCandidatePaths', () => {
    it('returns a single xtrm target (project-scoped by default)', () => {
        const candidates = getCandidatePaths(false, '/my/project');
        expect(candidates).toHaveLength(1);
        expect(candidates[0].label).toBe('.xtrm');
        expect(candidates[0].path).toBe(path.join('/my/project', '.xtrm'));
    });

    it('returns global xtrm target with isGlobal=true', () => {
        const candidates = getCandidatePaths(true);
        expect(candidates).toHaveLength(1);
        expect(candidates[0].label).toBe('~/.xtrm');
        expect(candidates[0].path).toBe(path.join(os.homedir(), '.xtrm'));
    });

    it('falls back to global xtrm when no projectRoot provided', () => {
        const candidates = getCandidatePaths(false);
        expect(candidates).toHaveLength(1);
        expect(candidates[0].path).toBe(path.join(os.homedir(), '.xtrm'));
    });
});
