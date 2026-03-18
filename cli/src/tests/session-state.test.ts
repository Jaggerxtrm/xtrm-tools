import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  findSessionStateFile,
  readSessionState,
  writeSessionState,
  updateSessionPhase,
} from '../core/session-state.js';

describe('session-state.ts', () => {
  it('returns null when no state file exists', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-session-state-none-'));
    try {
      expect(findSessionStateFile(dir)).toBeNull();
      expect(readSessionState(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes and reads state roundtrip', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-session-state-roundtrip-'));
    try {
      writeSessionState({
        issueId: 'jaggers-agent-tools-1xa2',
        branch: 'feature/jaggers-agent-tools-1xa2',
        worktreePath: '/tmp/worktrees/jaggers-agent-tools-1xa2',
        prNumber: null,
        prUrl: null,
        phase: 'claimed',
        conflictFiles: [],
        startedAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      }, dir);

      const state = readSessionState(dir);
      expect(state).not.toBeNull();
      expect(state?.issueId).toBe('jaggers-agent-tools-1xa2');
      expect(state?.phase).toBe('claimed');
      expect(Array.isArray(state?.conflictFiles)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('findSessionStateFile walks up directory tree', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'xtrm-session-state-walk-'));
    const nested = path.join(root, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });

    try {
      writeSessionState({
        issueId: 'walk-1',
        branch: 'feature/walk-1',
        worktreePath: '/tmp/worktrees/walk-1',
        prNumber: null,
        prUrl: null,
        phase: 'claimed',
        conflictFiles: [],
        startedAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      }, root);

      const found = findSessionStateFile(nested);
      expect(found).toBe(path.join(root, '.xtrm-session-state.json'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('enforces phase transition validation', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-session-state-phase-'));
    try {
      writeSessionState({
        issueId: 'phase-1',
        branch: 'feature/phase-1',
        worktreePath: '/tmp/worktrees/phase-1',
        prNumber: null,
        prUrl: null,
        phase: 'claimed',
        conflictFiles: [],
        startedAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      }, dir);

      const waiting = updateSessionPhase('waiting-merge', dir, { prNumber: 12 });
      expect(waiting.phase).toBe('waiting-merge');

      const done = updateSessionPhase('cleanup-done', dir);
      expect(done.phase).toBe('cleanup-done');

      expect(() => updateSessionPhase('claimed', dir)).toThrow(/Invalid phase transition/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('updates persisted file on phase changes', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'xtrm-session-state-persist-'));
    try {
      writeSessionState({
        issueId: 'persist-1',
        branch: 'feature/persist-1',
        worktreePath: '/tmp/worktrees/persist-1',
        prNumber: null,
        prUrl: null,
        phase: 'claimed',
        conflictFiles: [],
        startedAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      }, dir);

      updateSessionPhase('conflicting', dir, { conflictFiles: ['src/core.ts'] });
      const raw = JSON.parse(readFileSync(path.join(dir, '.xtrm-session-state.json'), 'utf8'));
      expect(raw.phase).toBe('conflicting');
      expect(raw.conflictFiles).toContain('src/core.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
