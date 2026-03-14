import { describe, expect, it } from 'vitest';
import { getCandidatePaths, resolveTargets } from '../src/core/context.js';

describe('getCandidatePaths', () => {
    it('includes Claude Code and skills-only targets', () => {
        const candidates = getCandidatePaths();
        expect(candidates.some(candidate => candidate.label === '~/.claude (hooks + skills)')).toBe(true);
        expect(candidates.some(candidate => candidate.label === '~/.agents/skills')).toBe(true);
        expect(candidates.length).toBe(2);
    });
});

describe('resolveTargets', () => {
    it('returns all candidate paths for the "*" selector', () => {
        const candidates = getCandidatePaths();
        expect(resolveTargets('*', candidates)).toEqual(candidates.map(candidate => candidate.path));
    });

    it('returns all candidate paths for the "all" selector', () => {
        const candidates = getCandidatePaths();
        expect(resolveTargets('all', candidates)).toEqual(candidates.map(candidate => candidate.path));
    });

    it('returns null when no selector is provided', () => {
        expect(resolveTargets(undefined, getCandidatePaths())).toBeNull();
    });

    it('rejects unknown selectors', () => {
        expect(() => resolveTargets('everything', getCandidatePaths())).toThrow(
            "Unknown install target selector 'everything'. Use '*' or 'all'.",
        );
    });
});
