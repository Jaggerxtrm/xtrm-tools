#!/usr/bin/env node
/**
 * Tests for main-guard.cjs Bash tool handler.
 * Uses subprocess spawning — main-guard.cjs calls process.exit() so it
 * cannot be require()'d directly in the test runner.
 *
 * Controls protected branches via MAIN_GUARD_PROTECTED_BRANCHES env var
 * so tests run consistently regardless of the current git branch.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const HOOK = path.join(__dirname, 'main-guard.cjs');

function runHook(toolName, toolInput, env = {}) {
  const input = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
  return spawnSync('node', [HOOK], {
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// Get current branch without shell expansion (safe, no user input)
const CURRENT_BRANCH = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

const ON_PROTECTED = { MAIN_GUARD_PROTECTED_BRANCHES: CURRENT_BRANCH };
const NOT_PROTECTED = { MAIN_GUARD_PROTECTED_BRANCHES: 'nonexistent-branch-xyz' };

test('blocks git merge on protected branch via Bash tool', () => {
  const result = runHook('Bash', { command: 'git merge feat/something' }, ON_PROTECTED);
  assert.equal(result.status, 2, `Expected exit 2 (blocked), got ${result.status}`);
});

test('blocks git cherry-pick on protected branch', () => {
  const result = runHook('Bash', { command: 'git cherry-pick abc123' }, ON_PROTECTED);
  assert.equal(result.status, 2, `Expected exit 2 (blocked), got ${result.status}`);
});

test('allows git log on protected branch via Bash tool', () => {
  const result = runHook('Bash', { command: 'git log --oneline' }, ON_PROTECTED);
  assert.equal(result.status, 0, `Expected exit 0 (allowed), got ${result.status}`);
});

test('blocks git rebase on protected branch', () => {
  const result = runHook('Bash', { command: 'git rebase main' }, ON_PROTECTED);
  assert.equal(result.status, 2, `Expected exit 2 (blocked), got ${result.status}`);
});

test('blocks git reset --hard on protected branch', () => {
  const result = runHook('Bash', { command: 'git reset --hard HEAD~1' }, ON_PROTECTED);
  assert.equal(result.status, 2, `Expected exit 2 (blocked), got ${result.status}`);
});

test('blocks git push --force on protected branch', () => {
  const result = runHook('Bash', { command: 'git push --force' }, ON_PROTECTED);
  assert.equal(result.status, 2, `Expected exit 2 (blocked), got ${result.status}`);
});

test('blocks git commit on protected branch', () => {
  const result = runHook('Bash', { command: 'git commit -m "fix"' }, ON_PROTECTED);
  assert.equal(result.status, 2, `Expected exit 2 (blocked), got ${result.status}`);
});
