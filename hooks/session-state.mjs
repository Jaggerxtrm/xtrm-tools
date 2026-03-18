#!/usr/bin/env node

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
];

const ALLOWED_TRANSITIONS = {
  claimed: ['phase1-done', 'waiting-merge', 'conflicting', 'pending-cleanup', 'cleanup-done'],
  'phase1-done': ['waiting-merge', 'conflicting', 'pending-cleanup', 'cleanup-done'],
  'waiting-merge': ['conflicting', 'pending-cleanup', 'merged', 'cleanup-done'],
  conflicting: ['waiting-merge', 'pending-cleanup', 'merged', 'cleanup-done'],
  'pending-cleanup': ['waiting-merge', 'conflicting', 'merged', 'cleanup-done'],
  merged: ['cleanup-done'],
  'cleanup-done': [],
};

function nowIso() {
  return new Date().toISOString();
}

function isValidPhase(phase) {
  return typeof phase === 'string' && SESSION_PHASES.includes(phase);
}

function normalizeState(state) {
  if (!state || typeof state !== 'object') throw new Error('Invalid session state payload');
  if (!state.issueId || !state.branch || !state.worktreePath) {
    throw new Error('Session state requires issueId, branch, and worktreePath');
  }
  if (!isValidPhase(state.phase)) throw new Error(`Invalid phase: ${String(state.phase)}`);

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

function canTransition(from, to) {
  if (!isValidPhase(from) || !isValidPhase(to)) return false;
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

function findAncestorStateFile(startCwd) {
  let current = path.resolve(startCwd || process.cwd());
  for (;;) {
    const candidate = path.join(current, SESSION_STATE_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function findRepoRoot(cwd) {
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

export function findSessionStateFile(startCwd) {
  return findAncestorStateFile(startCwd);
}

export function readSessionState(startCwd) {
  const filePath = findSessionStateFile(startCwd);
  if (!filePath) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    const state = normalizeState(parsed);
    return { ...state, _filePath: filePath };
  } catch {
    return null;
  }
}

export function resolveSessionStatePath(cwd) {
  const existing = findSessionStateFile(cwd);
  if (existing) return existing;

  const repoRoot = findRepoRoot(cwd);
  if (repoRoot) return path.join(repoRoot, SESSION_STATE_FILE);
  return path.join(cwd, SESSION_STATE_FILE);
}

export function writeSessionState(state, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const filePath = opts.filePath || resolveSessionStatePath(cwd);
  const normalized = normalizeState(state);
  writeFileSync(filePath, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  return filePath;
}

export function updateSessionPhase(startCwd, nextPhase, patch = {}) {
  if (!isValidPhase(nextPhase)) throw new Error(`Invalid phase: ${String(nextPhase)}`);
  const existing = readSessionState(startCwd);
  if (!existing) throw new Error('Session state file not found');
  if (!canTransition(existing.phase, nextPhase)) {
    throw new Error(`Invalid phase transition: ${existing.phase} -> ${nextPhase}`);
  }

  const nextState = {
    ...existing,
    ...patch,
    phase: nextPhase,
  };

  delete nextState._filePath;
  const filePath = writeSessionState(nextState, { filePath: existing._filePath, cwd: startCwd });
  return { ...nextState, _filePath: filePath };
}
