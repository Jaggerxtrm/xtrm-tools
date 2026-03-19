import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  readSessionState,
  updateSessionPhase,
  type SessionState,
} from './session-state.js';

export interface FinishOptions {
  cwd?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface FinishResult {
  ok: boolean;
  message: string;
}

interface CmdResult {
  code: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function run(cmd: string, args: string[], cwd: string): CmdResult {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    code: r.status ?? 1,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
  };
}

function getControlRepoRoot(cwd: string): string {
  const commonDir = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  if (commonDir.code === 0 && commonDir.stdout) {
    return commonDir.stdout.replace(/\/.git$/, '');
  }
  return cwd;
}

function resolveExecutionCwd(controlCwd: string, state: SessionState): string {
  if (state.worktreePath && existsSync(state.worktreePath)) {
    return state.worktreePath;
  }
  return controlCwd;
}

function parsePrCreate(stdout: string): { prNumber: number | null; prUrl: string | null } {
  const urlMatch = stdout.match(/https?:\/\/\S+\/pull\/(\d+)/);
  if (urlMatch) {
    return { prNumber: Number(urlMatch[1]), prUrl: urlMatch[0] };
  }

  const numberMatch = stdout.match(/#(\d+)/);
  if (numberMatch) {
    return { prNumber: Number(numberMatch[1]), prUrl: null };
  }

  return { prNumber: null, prUrl: null };
}

function getConflictFiles(cwd: string): string[] {
  const out = run('git', ['diff', '--name-only', '--diff-filter=U'], cwd);
  if (out.code !== 0 || !out.stdout) return [];
  return out.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureCleanPhaseTransition(cwd: string, phase: SessionState['phase'], patch: Partial<SessionState> = {}) {
  try {
    updateSessionPhase(phase, cwd, patch);
  } catch {
    // non-fatal for re-entrant paths
  }
}

function handleRebaseAndPush(cwd: string): { ok: boolean; conflicts?: string[]; error?: string } {
  const fetch = run('git', ['fetch', 'origin'], cwd);
  if (fetch.code !== 0) return { ok: false, error: fetch.stderr || fetch.stdout };

  const rebase = run('git', ['rebase', 'origin/main'], cwd);
  if (rebase.code !== 0) {
    const conflicts = getConflictFiles(cwd);
    return { ok: false, conflicts, error: rebase.stderr || rebase.stdout };
  }

  const push = run('git', ['push', '--force-with-lease'], cwd);
  if (push.code !== 0) {
    return { ok: false, error: push.stderr || push.stdout };
  }

  return { ok: true };
}

function cleanupPhase(controlCwd: string, state: SessionState): FinishResult {
  if (existsSync(state.worktreePath)) {
    const rm = run('git', ['worktree', 'remove', state.worktreePath, '--force'], controlCwd);
    if (rm.code !== 0) {
      return { ok: false, message: rm.stderr || rm.stdout || `Failed to remove worktree ${state.worktreePath}` };
    }
  }

  run('git', ['fetch', '--prune'], controlCwd);
  ensureCleanPhaseTransition(controlCwd, 'cleanup-done');

  const prLabel = state.prNumber != null ? `#${state.prNumber}` : '(unknown PR)';
  return { ok: true, message: `Done. PR ${prLabel} merged. Worktree removed.` };
}

async function pollUntilMerged(controlCwd: string, executionCwd: string, state: SessionState, opts: Required<FinishOptions>): Promise<FinishResult> {
  if (state.prNumber == null) {
    return { ok: false, message: 'Session state missing prNumber. Re-run phase 1 before polling.' };
  }

  const started = Date.now();
  while ((Date.now() - started) < opts.timeoutMs) {
    const view = run('gh', ['pr', 'view', String(state.prNumber), '--json', 'state,mergeStateStatus,mergeable'], executionCwd);

    if (view.code !== 0) {
      return { ok: false, message: view.stderr || view.stdout || `Failed to inspect PR #${state.prNumber}` };
    }

    let payload: any = null;
    try {
      payload = JSON.parse(view.stdout);
    } catch {
      return { ok: false, message: `Unable to parse gh pr view output for #${state.prNumber}` };
    }

    ensureCleanPhaseTransition(controlCwd, 'waiting-merge');

    if (payload.state === 'MERGED') {
      ensureCleanPhaseTransition(controlCwd, 'merged');
      const latest = readSessionState(controlCwd) ?? state;
      return cleanupPhase(controlCwd, latest);
    }

    if (payload.mergeStateStatus === 'BEHIND') {
      run('git', ['fetch', 'origin'], executionCwd);
      run('git', ['push'], executionCwd);
      await delay(opts.pollIntervalMs);
      continue;
    }

    if (payload.mergeable === 'CONFLICTING') {
      const rebased = handleRebaseAndPush(executionCwd);
      if (!rebased.ok) {
        const conflictFiles = rebased.conflicts ?? getConflictFiles(executionCwd);
        ensureCleanPhaseTransition(controlCwd, 'conflicting', { conflictFiles });
        return {
          ok: false,
          message: `Conflicts in: ${conflictFiles.join(', ') || 'unknown files'}. Resolve, push, then re-run xtrm finish.`,
        };
      }

      ensureCleanPhaseTransition(controlCwd, 'waiting-merge', { conflictFiles: [] });
      await delay(opts.pollIntervalMs);
      continue;
    }

    await delay(opts.pollIntervalMs);
  }

  ensureCleanPhaseTransition(controlCwd, 'pending-cleanup');
  return {
    ok: false,
    message: `PR #${state.prNumber} not yet merged. Run xtrm finish when ready.`,
  };
}

function isWorkingTreeDirty(cwd: string): boolean {
  const st = run('git', ['status', '--porcelain'], cwd);
  return st.code === 0 && st.stdout.length > 0;
}

function runPhase1(controlCwd: string, executionCwd: string, state: SessionState): FinishResult {
  if (isWorkingTreeDirty(executionCwd)) {
    const add = run('git', ['add', '-A'], executionCwd);
    if (add.code !== 0) return { ok: false, message: add.stderr || add.stdout };

    const msg = `feat(${state.issueId}): ${state.branch}`;
    const commit = run('git', ['commit', '-m', msg], executionCwd);
    if (commit.code !== 0) {
      return { ok: false, message: commit.stderr || commit.stdout || 'git commit failed' };
    }
  }

  const push = run('git', ['push', '-u', 'origin', state.branch], executionCwd);
  if (push.code !== 0) return { ok: false, message: push.stderr || push.stdout || 'git push failed' };

  const create = run('gh', ['pr', 'create', '--fill'], executionCwd);
  if (create.code !== 0) return { ok: false, message: create.stderr || create.stdout || 'gh pr create failed' };
  const parsed = parsePrCreate(create.stdout);

  const merge = run('gh', ['pr', 'merge', '--squash', '--auto'], executionCwd);
  if (merge.code !== 0) return { ok: false, message: merge.stderr || merge.stdout || 'gh pr merge failed' };

  ensureCleanPhaseTransition(controlCwd, 'phase1-done', {
    prNumber: parsed.prNumber,
    prUrl: parsed.prUrl,
  });
  ensureCleanPhaseTransition(controlCwd, 'waiting-merge', {
    prNumber: parsed.prNumber,
    prUrl: parsed.prUrl,
  });

  return { ok: true, message: 'phase1 complete' };
}

export async function runXtrmFinish(options: FinishOptions = {}): Promise<FinishResult> {
  const cwd = options.cwd ?? process.cwd();
  const controlCwd = getControlRepoRoot(cwd);

  const state = readSessionState(controlCwd);
  if (!state) {
    return { ok: false, message: 'No .xtrm-session-state.json found. Claim an issue first (bd update <id> --claim).' };
  }

  const executionCwd = resolveExecutionCwd(controlCwd, state);

  const opts: Required<FinishOptions> = {
    cwd: controlCwd,
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  if (state.phase === 'cleanup-done') {
    return { ok: true, message: 'Session is already cleanup-done.' };
  }

  if (state.phase === 'conflicting') {
    const resolved = handleRebaseAndPush(executionCwd);
    if (!resolved.ok) {
      const files = resolved.conflicts ?? getConflictFiles(executionCwd);
      ensureCleanPhaseTransition(controlCwd, 'conflicting', { conflictFiles: files });
      return { ok: false, message: `Conflicts in: ${files.join(', ') || 'unknown files'}. Resolve, push, then re-run xtrm finish.` };
    }
    ensureCleanPhaseTransition(controlCwd, 'waiting-merge', { conflictFiles: [] });
    const refreshed = readSessionState(controlCwd) ?? state;
    return pollUntilMerged(controlCwd, executionCwd, refreshed, opts);
  }

  if (state.phase === 'waiting-merge' || state.phase === 'pending-cleanup' || state.phase === 'merged') {
    const refreshed = readSessionState(controlCwd) ?? state;
    if (refreshed.phase === 'merged') return cleanupPhase(controlCwd, refreshed);
    return pollUntilMerged(controlCwd, executionCwd, refreshed, opts);
  }

  const phase1 = runPhase1(controlCwd, executionCwd, state);
  if (!phase1.ok) return phase1;

  const refreshed = readSessionState(controlCwd) ?? state;
  return pollUntilMerged(controlCwd, executionCwd, refreshed, opts);
}
