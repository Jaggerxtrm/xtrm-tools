import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SESSION_STATE_FILE = '.xtrm-session-state.json';

export const SESSION_PHASES = [
  'claimed',
  'phase1-done',
  'waiting-merge',
  'conflicting',
  'pending-cleanup',
  'merged',
  'cleanup-done',
] as const;

export type SessionPhase = typeof SESSION_PHASES[number];

export interface SessionState {
  issueId: string;
  branch: string;
  worktreePath: string;
  prNumber: number | null;
  prUrl: string | null;
  phase: SessionPhase;
  conflictFiles: string[];
  startedAt: string;
  lastChecked: string;
}

const ALLOWED_TRANSITIONS: Record<SessionPhase, SessionPhase[]> = {
  claimed: ['phase1-done', 'waiting-merge', 'conflicting', 'pending-cleanup', 'cleanup-done'],
  'phase1-done': ['waiting-merge', 'conflicting', 'pending-cleanup', 'cleanup-done'],
  'waiting-merge': ['conflicting', 'pending-cleanup', 'merged', 'cleanup-done'],
  conflicting: ['waiting-merge', 'pending-cleanup', 'merged', 'cleanup-done'],
  'pending-cleanup': ['waiting-merge', 'conflicting', 'merged', 'cleanup-done'],
  merged: ['cleanup-done'],
  'cleanup-done': [],
};

const nowIso = () => new Date().toISOString();

function isPhase(value: unknown): value is SessionPhase {
  return typeof value === 'string' && (SESSION_PHASES as readonly string[]).includes(value);
}

function normalizeState(value: unknown): SessionState {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid session state payload');
  }

  const state = value as Partial<SessionState>;
  if (!state.issueId || !state.branch || !state.worktreePath || !state.phase) {
    throw new Error('Session state requires issueId, branch, worktreePath, and phase');
  }
  if (!isPhase(state.phase)) throw new Error(`Invalid session phase: ${String(state.phase)}`);

  return {
    issueId: String(state.issueId),
    branch: String(state.branch),
    worktreePath: String(state.worktreePath),
    prNumber: state.prNumber ?? null,
    prUrl: state.prUrl ?? null,
    phase: state.phase,
    conflictFiles: Array.isArray(state.conflictFiles) ? state.conflictFiles.map(String) : [],
    startedAt: state.startedAt || nowIso(),
    lastChecked: nowIso(),
  };
}

function findRepoRoot(cwd: string): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

export function findSessionStateFile(startCwd: string = process.cwd()): string | null {
  let current = path.resolve(startCwd);
  for (;;) {
    const candidate = path.join(current, SESSION_STATE_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function readSessionState(startCwd: string = process.cwd()): SessionState | null {
  const filePath = findSessionStateFile(startCwd);
  if (!filePath) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return normalizeState(parsed);
  } catch {
    return null;
  }
}

export function writeSessionState(state: Partial<SessionState>, cwd: string = process.cwd()): string {
  const filePath = findSessionStateFile(cwd)
    ?? (findRepoRoot(cwd) ? path.join(findRepoRoot(cwd) as string, SESSION_STATE_FILE) : path.join(cwd, SESSION_STATE_FILE));

  const normalized = normalizeState(state);
  writeFileSync(filePath, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  return filePath;
}

export function updateSessionPhase(nextPhase: SessionPhase, startCwd: string = process.cwd(), patch: Partial<SessionState> = {}): SessionState {
  const filePath = findSessionStateFile(startCwd);
  if (!filePath) throw new Error('Session state file not found');

  const current = readSessionState(startCwd);
  if (!current) throw new Error('Session state file invalid');

  if (!isPhase(nextPhase)) {
    throw new Error(`Invalid session phase: ${String(nextPhase)}`);
  }

  if (current.phase !== nextPhase && !ALLOWED_TRANSITIONS[current.phase].includes(nextPhase)) {
    throw new Error(`Invalid phase transition: ${current.phase} -> ${nextPhase}`);
  }

  const nextState = normalizeState({
    ...current,
    ...patch,
    phase: nextPhase,
  });

  writeFileSync(filePath, JSON.stringify(nextState, null, 2) + '\n', 'utf8');
  return nextState;
}
