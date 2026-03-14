#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.php', '.go', '.rs', '.java', '.kt', '.kts',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp',
  '.cs', '.rb', '.swift', '.scala', '.lua', '.sh', '.zsh', '.bash',
]);

const SERENA_EDIT_TOOLS = new Set([
  'mcp__serena__rename_symbol',
  'mcp__serena__replace_symbol_body',
  'mcp__serena__insert_after_symbol',
  'mcp__serena__insert_before_symbol',
]);

function isEditLikeTool(toolName) {
  if (!toolName) return false;
  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'MultiEdit' || toolName === 'TodoWrite') {
    return true;
  }
  return SERENA_EDIT_TOOLS.has(toolName);
}

function pickFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;

  const direct = toolInput.file_path || toolInput.filePath || toolInput.path ||
    toolInput.relative_path || toolInput.relativePath;
  if (typeof direct === 'string' && direct.trim()) return direct;

  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      const p = edit?.file_path || edit?.filePath || edit?.path || edit?.relative_path || edit?.relativePath;
      if (typeof p === 'string' && p.trim()) return p;
    }
  }

  return null;
}

function isCodeFile(filePath) {
  if (!filePath) return true; // fail-open when no path is available
  return CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

let payloadText = '';
try {
  payloadText = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(payloadText);
} catch {
  process.exit(0);
}

const toolName = payload.tool_name || '';
if (!isEditLikeTool(toolName)) {
  process.exit(0);
}

const filePath = pickFilePath(payload.tool_input);
if (!isCodeFile(filePath)) {
  process.exit(0);
}

const result = spawnSync('tdd-guard', {
  input: payloadText,
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error) {
  process.exit(0);
}

process.exit(result.status ?? 0);
