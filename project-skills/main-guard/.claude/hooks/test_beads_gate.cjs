#!/usr/bin/env node
/**
 * Tests for beads-edit-gate.mjs open-issue bypass.
 * Uses subprocess with a mock `bd` script so we control bd output.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const { mkdtempSync, writeFileSync, mkdirSync, chmodSync } = require('fs');
const { tmpdir } = require('os');
const path = require('path');

const GATE = path.join(process.env.HOME, '.claude/hooks/beads-edit-gate.mjs');

function setupProject(bdScript) {
  const dir = mkdtempSync(path.join(tmpdir(), 'beads-gate-test-'));
  mkdirSync(path.join(dir, '.beads'));

  // Write mock `bd` that the gate calls
  const mockBd = path.join(dir, 'bd');
  writeFileSync(mockBd, bdScript);
  chmodSync(mockBd, 0o755);

  return dir;
}

function runGate(projectDir) {
  const input = JSON.stringify({ cwd: projectDir });
  return spawnSync('node', [GATE], {
    input,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${projectDir}:${process.env.PATH}` },
  });
}

test('allows writes when all issues are closed (no open, no in_progress)', () => {
  const dir = setupProject(`#!/bin/bash
echo "No issues found."
`);
  const result = runGate(dir);
  assert.equal(result.status, 0, `Expected exit 0 (allow), got ${result.status}\nstderr: ${result.stderr}`);
});

test('blocks writes when open issues exist but none are in_progress', () => {
  const dir = setupProject(`#!/bin/bash
if [[ "$*" == *"in_progress"* ]]; then
  echo "No issues found."
elif [[ "$*" == *"open"* ]]; then
  echo "○ proj-abc P1 Fix something"
fi
`);
  const result = runGate(dir);
  assert.equal(result.status, 2, `Expected exit 2 (block), got ${result.status}`);
});
