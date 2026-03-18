// Canonical guard rule definitions shared across hooks, policies, and extensions.
// Pure data module: named exports only.

export const WRITE_TOOLS = [
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  'mcp__serena__rename_symbol',
  'mcp__serena__replace_symbol_body',
  'mcp__serena__insert_after_symbol',
  'mcp__serena__insert_before_symbol',
];

export const DANGEROUS_BASH_PATTERNS = [
  'sed\\s+-i',
  'echo\\s+[^\\n]*>',
  'printf\\s+[^\\n]*>',
  'cat\\s+[^\\n]*>',
  'tee\\b',
  '(?:^|\\s)(?:vim|nano|vi)\\b',
  '(?:^|\\s)mv\\b',
  '(?:^|\\s)cp\\b',
  '(?:^|\\s)rm\\b',
  '(?:^|\\s)mkdir\\b',
  '(?:^|\\s)touch\\b',
  '(?:^|\\s)chmod\\b',
  '(?:^|\\s)chown\\b',
  '>>',
  '(?:^|\\s)git\\s+add\\b',
  '(?:^|\\s)git\\s+commit\\b',
  '(?:^|\\s)git\\s+merge\\b',
  '(?:^|\\s)git\\s+push\\b',
  '(?:^|\\s)git\\s+reset\\b',
  '(?:^|\\s)git\\s+checkout\\b',
  '(?:^|\\s)git\\s+rebase\\b',
  '(?:^|\\s)git\\s+stash\\b',
  '(?:^|\\s)npm\\s+install\\b',
  '(?:^|\\s)bun\\s+install\\b',
  '(?:^|\\s)bun\\s+add\\b',
  '(?:^|\\s)node\\s+(?:-e|--eval)\\b',
  '(?:^|\\s)bun\\s+(?:-e|--eval)\\b',
  '(?:^|\\s)python\\s+-c\\b',
  '(?:^|\\s)perl\\s+-e\\b',
  '(?:^|\\s)ruby\\s+-e\\b',
];

export const SAFE_BASH_PREFIXES = [
  'git status',
  'git log',
  'git diff',
  'git show',
  'git blame',
  'git branch',
  'git fetch',
  'git remote',
  'git config',
  'git pull',
  'git stash',
  'git worktree',
  'git checkout -b',
  'git switch -c',
  'gh',
  'bd',
  'touch .beads/',
  'npx gitnexus',
];

export const NATIVE_TEAM_TOOLS = [
  'Task',
  'TeamCreate',
  'TeamDelete',
  'SendMessage',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'TaskOutput',
  'TaskStop',
];

export const INTERACTIVE_TOOLS = [
  'AskUserQuestion',
  'EnterPlanMode',
  'EnterWorktree',
];
