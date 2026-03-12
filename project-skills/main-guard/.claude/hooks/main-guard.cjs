#!/usr/bin/env node
/**
 * Main Guard - Git branch protection hook for Claude Code.
 * Blocks direct edits to main/master branches and enforces feature branch workflow.
 * 
 * Exit codes:
 *   0 - Allowed (not on protected branch, or operation allowed)
 *   1 - Fatal error
 *   2 - Blocked (attempted edit on protected branch)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Colors
const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[0;33m',
  blue: '\x1b[0;34m',
  cyan: '\x1b[0;36m',
  reset: '\x1b[0m',
};

function log(msg, color = '') {
  console.error(`${color}${msg}${colors.reset}`);
}

function logInfo(msg) { log(`[INFO] ${msg}`, colors.blue); }
function logError(msg) { log(`[ERROR] ${msg}`, colors.red); }
function logSuccess(msg) { log(`[OK] ${msg}`, colors.green); }
function logWarning(msg) { log(`[WARN] ${msg}`, colors.yellow); }

/**
 * Get current git branch name
 */
function getCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    logWarning('Could not determine git branch');
    return null;
  }
}

/**
 * Check if branch is protected
 */
function isProtectedBranch(branch) {
  if (!branch) return false;
  
  // Get protected branches from config or use defaults
  const protectedPatterns = process.env.MAIN_GUARD_PROTECTED_BRANCHES 
    ? process.env.MAIN_GUARD_PROTECTED_BRANCHES.split(',') 
    : ['main', 'master', 'develop'];
  
  return protectedPatterns.some(pattern => {
    const regex = new RegExp(`^${pattern.replace('*', '.*')}$`);
    return regex.test(branch);
  });
}

/**
 * Get feature branch name suggestion based on task
 */
function suggestBranchName(input) {
  const toolName = input.tool_name || '';
  const prompt = input.user_prompt || '';
  
  // Extract potential task identifier
  const match = prompt.match(/(?:issue|ticket|task|bug|feat)[#:-]?\s*(\d+|[a-z-]+)/i) ||
                prompt.match(/^([a-z-]+)/i);
  
  if (match) {
    const prefix = toolName.includes('Edit') || toolName.includes('Write') ? 'fix' : 'feat';
    return `${prefix}/${match[1].toLowerCase().replace(/\s+/g, '-')}`;
  }
  
  return 'feature/task';
}

/**
 * Parse JSON input from stdin
 */
function parseInput() {
  let inputData = '';
  
  try {
    inputData = fs.readFileSync(0, 'utf8');
  } catch (e) {
    return null;
  }
  
  if (!inputData.trim()) {
    return null;
  }
  
  try {
    return JSON.parse(inputData);
  } catch (e) {
    logWarning('Invalid JSON input');
    return null;
  }
}

/**
 * Print blocked message with instructions
 */
function printBlocked(branch, suggestedBranch) {
  log('', colors.red);
  log('═══════════════════════════════════════════════════════════', colors.red);
  log('  🛑 BLOCKED: Direct edits to protected branches', colors.red);
  log('═══════════════════════════════════════════════════════════', colors.red);
  log('', colors.reset);
  log(`  Current branch: ${colors.yellow}${branch}${colors.reset}`, colors.reset);
  log('', colors.reset);
  log('  You cannot edit files directly on a protected branch.', colors.reset);
  log('  This prevents accidental commits and enforces code review.', colors.reset);
  log('', colors.reset);
  log('  📋 To proceed:', colors.cyan);
  log(`     1. Create a feature branch: ${colors.green}git checkout -b ${suggestedBranch}${colors.reset}`, colors.reset);
  log(`     2. Make your changes on that branch`, colors.reset);
  log(`     3. Push and create a pull request`, colors.reset);
  log('', colors.reset);
  log('═══════════════════════════════════════════════════════════', colors.red);
  log('', colors.reset);
}

/**
 * Print success message
 */
function printSuccess(branch) {
  log('', colors.green);
  log(`✅ Git workflow check passed`, colors.green);
  log(`   Branch: ${branch}`, colors.green);
  log('', colors.reset);
}

/**
 * Main entry point
 */
function main() {
  log('');
  log('🔒 Main Guard - Branch Protection Check', colors.blue);
  log('─────────────────────────────────────────', colors.blue);
  
  // Parse input
  const input = parseInput();
  
  // Get current branch
  const branch = getCurrentBranch();
  
  if (!branch) {
    logWarning('Not in a git repository - skipping branch protection');
    log('', colors.yellow);
    log('👉 Not a git repository - continuing without branch protection', colors.yellow);
    log('', colors.reset);
    process.exit(0);
  }
  
  logInfo(`Current branch: ${branch}`);
  
  // Check if protected
  if (isProtectedBranch(branch)) {
    const suggestedBranch = suggestBranchName(input || {});
    printBlocked(branch, suggestedBranch);
    process.exit(2);
  }
  
  // Not a protected branch - allow
  printSuccess(branch);
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  logError(`Unhandled error: ${error.message}`);
  process.exit(1);
});

// Run
try {
  main();
} catch (error) {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
}
