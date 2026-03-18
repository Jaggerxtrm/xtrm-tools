# install-service-skills Subcommand Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `install-service-skills` as a Commander subcommand to the existing CLI so `npx github:<owner>/jaggers-agent-tools install-service-skills` installs the Service Skill Trinity into any target project.

**Architecture:** New file `cli/src/commands/install-service-skills.ts` exports pure-ish functions (mergeSettingsHooks, installSkills, installGitHooks, getProjectRoot) plus a `createInstallServiceSkillsCommand()` factory. Source assets are resolved via `__dirname` (CJS, works identically locally and in the npx temp cache). Git hook scripts are copied into the target project at `.claude/git-hooks/` so no reference back to the jaggers package is needed at runtime.

**Tech Stack:** TypeScript, Commander, fs-extra (already bundled), kleur (already bundled), Node.js `child_process` (spawnSync — matches existing preflight.ts pattern), Vitest

---

### Task 1: Create test file skeleton and verify vitest discovers it

**Files:**
- Create: `cli/test/install-service-skills.test.ts`

**Step 1: Create the test file**

```typescript
// cli/test/install-service-skills.test.ts
import { describe, it, expect } from 'vitest';

describe('install-service-skills', () => {
    it('placeholder', () => {
        expect(true).toBe(true);
    });
});
```

**Step 2: Run to verify vitest picks it up**

```bash
cd cli && npm test
```

Expected: `1 test passed`

**Step 3: Commit**

```bash
git add cli/test/install-service-skills.test.ts
git commit -m "test: add install-service-skills test skeleton"
```

---

### Task 2: Implement and test `mergeSettingsHooks`

This is a pure function — no file system needed. It takes an existing parsed `settings.json` object and returns it with the three hooks non-destructively merged, plus lists of what was added vs skipped.

**Files:**
- Create: `cli/src/commands/install-service-skills.ts` (partial — constants and mergeSettingsHooks only)
- Modify: `cli/test/install-service-skills.test.ts`

**Step 1: Write the failing tests**

Replace the placeholder in `cli/test/install-service-skills.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mergeSettingsHooks } from '../src/commands/install-service-skills.js';

describe('mergeSettingsHooks', () => {
    it('adds all three hooks to empty settings', () => {
        const { result, added, skipped } = mergeSettingsHooks({});
        const hooks = result.hooks as Record<string, unknown>;
        expect(added).toEqual(['SessionStart', 'PreToolUse', 'PostToolUse']);
        expect(skipped).toEqual([]);
        expect(hooks).toHaveProperty('SessionStart');
        expect(hooks).toHaveProperty('PreToolUse');
        expect(hooks).toHaveProperty('PostToolUse');
    });

    it('preserves existing keys and skips them', () => {
        const existing = { hooks: { SessionStart: [{ custom: true }] } };
        const { result, added, skipped } = mergeSettingsHooks(existing);
        const hooks = result.hooks as Record<string, unknown>;
        expect(skipped).toEqual(['SessionStart']);
        expect(added).toEqual(['PreToolUse', 'PostToolUse']);
        expect(hooks.SessionStart).toEqual([{ custom: true }]);
    });

    it('preserves non-hook keys in settings', () => {
        const existing = { apiKey: 'abc', permissions: { allow: [] } };
        const { result } = mergeSettingsHooks(existing);
        expect(result.apiKey).toBe('abc');
        expect(result.permissions).toEqual({ allow: [] });
    });
});
```

**Step 2: Run to verify they fail**

```bash
cd cli && npm test
```

Expected: 3 tests fail with import error (file does not exist yet)

**Step 3: Create `cli/src/commands/install-service-skills.ts`**

```typescript
import { Command } from 'commander';
import kleur from 'kleur';
import path from 'path';
import fs from 'fs-extra';
import { spawnSync } from 'child_process';

// CJS: __dirname = cli/dist/ — two levels up = package root
declare const __dirname: string;
const PKG_ROOT = path.resolve(__dirname, '../..');
const SKILLS_SRC = path.join(PKG_ROOT, 'project-skills', 'service-skills-set', '.claude');

const TRINITY = [
    'creating-service-skills',
    'using-service-skills',
    'updating-service-skills',
    'scoping-service-skills',
];

const SETTINGS_HOOKS: Record<string, unknown[]> = {
    SessionStart: [
        {
            hooks: [{
                type: 'command',
                command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/skills/using-service-skills/scripts/cataloger.py"',
            }],
        },
    ],
    PreToolUse: [
        {
            matcher: 'Read|Write|Edit|Glob|Grep|Bash',
            hooks: [{
                type: 'command',
                command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/skills/using-service-skills/scripts/skill_activator.py"',
            }],
        },
    ],
    PostToolUse: [
        {
            matcher: 'Write|Edit',
            hooks: [{
                type: 'command',
                command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/skills/updating-service-skills/scripts/drift_detector.py" check-hook',
                timeout: 10,
            }],
        },
    ],
};

const MARKER_DOC = '# [jaggers] doc-reminder';
const MARKER_STALENESS = '# [jaggers] skill-staleness';

// ─── Pure functions (exported for testing) ───────────────────────────────────

export function mergeSettingsHooks(existing: Record<string, unknown>): {
    result: Record<string, unknown>;
    added: string[];
    skipped: string[];
} {
    const result = { ...existing };
    const hooks = (result.hooks ?? {}) as Record<string, unknown>;
    result.hooks = hooks;

    const added: string[] = [];
    const skipped: string[] = [];

    for (const [event, config] of Object.entries(SETTINGS_HOOKS)) {
        if (event in hooks) {
            skipped.push(event);
        } else {
            hooks[event] = config;
            added.push(event);
        }
    }

    return { result, added, skipped };
}

export function createInstallServiceSkillsCommand(): Command {
    return new Command('install-service-skills')
        .description('Install the Service Skill Trinity into the current project')
        .action(async () => {
            console.log(kleur.bold('\n  install-service-skills') + kleur.dim(' — not yet implemented\n'));
        });
}
```

**Step 4: Run tests**

```bash
cd cli && npm test
```

Expected: all 3 tests pass

**Step 5: Commit**

```bash
git add cli/src/commands/install-service-skills.ts cli/test/install-service-skills.test.ts
git commit -m "feat: add mergeSettingsHooks with tests"
```

---

### Task 3: Implement and test `installSkills`

**Files:**
- Modify: `cli/src/commands/install-service-skills.ts` (add installSkills)
- Modify: `cli/test/install-service-skills.test.ts` (add tests)

**Step 1: Add tests**

Append to `cli/test/install-service-skills.test.ts`:

```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import fsExtra from 'fs-extra';
import { installSkills } from '../src/commands/install-service-skills.js';

describe('installSkills', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(tmpdir(), 'jaggers-test-'));
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('creates .claude/skills/<skill> directories', async () => {
        await installSkills(tmpDir);
        for (const skill of ['creating-service-skills', 'using-service-skills', 'updating-service-skills', 'scoping-service-skills']) {
            const dest = path.join(tmpDir, '.claude', 'skills', skill);
            expect(await fsExtra.pathExists(dest)).toBe(true);
        }
    });

    it('is idempotent (safe to run twice)', async () => {
        await installSkills(tmpDir);
        await expect(installSkills(tmpDir)).resolves.not.toThrow();
    });
});
```

Note: add `import path from 'node:path';` at the top of the test file if not already there.

**Step 2: Run to verify they fail**

```bash
cd cli && npm test
```

Expected: 2 new tests fail (`installSkills is not a function`)

**Step 3: Add `installSkills` to the command file** (before `createInstallServiceSkillsCommand`):

```typescript
export async function installSkills(projectRoot: string): Promise<{ skill: string; status: 'installed' | 'updated' }[]> {
    const results: { skill: string; status: 'installed' | 'updated' }[] = [];
    for (const skill of TRINITY) {
        const src = path.join(SKILLS_SRC, skill);
        const dest = path.join(projectRoot, '.claude', 'skills', skill);
        const existed = await fs.pathExists(dest);
        if (existed) {
            await fs.remove(dest);
        }
        await fs.copy(src, dest, {
            filter: (src: string) => !src.includes('.Zone.Identifier'),
        });
        results.push({ skill, status: existed ? 'updated' : 'installed' });
    }
    return results;
}
```

**Step 4: Run tests**

```bash
cd cli && npm test
```

Expected: all tests pass

**Step 5: Commit**

```bash
git add cli/src/commands/install-service-skills.ts cli/test/install-service-skills.test.ts
git commit -m "feat: add installSkills with tests"
```

---

### Task 4: Implement and test `installGitHooks`

Copies git-hook Python scripts into the target project's `.claude/git-hooks/`, writes marker-guarded snippets into `.githooks/pre-commit` and `.githooks/pre-push`, and activates them in `.git/hooks/`.

**Key difference from the Python script:** The Python script embeds the jaggers source path in hook snippets, which breaks for npx users. Here the scripts are copied into `<target>/.claude/git-hooks/` and snippets reference that path.

**Files:**
- Modify: `cli/src/commands/install-service-skills.ts` (add installGitHooks)
- Modify: `cli/test/install-service-skills.test.ts` (add tests)

**Step 1: Add tests**

Append to `cli/test/install-service-skills.test.ts`:

```typescript
import { installGitHooks } from '../src/commands/install-service-skills.js';

describe('installGitHooks', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(tmpdir(), 'jaggers-test-'));
        await fsExtra.mkdirp(path.join(tmpDir, '.git', 'hooks'));
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('creates .githooks/pre-commit with doc-reminder snippet', async () => {
        await installGitHooks(tmpDir);
        const content = await fsExtra.readFile(path.join(tmpDir, '.githooks', 'pre-commit'), 'utf8');
        expect(content).toContain('# [jaggers] doc-reminder');
        expect(content).toContain('.claude/git-hooks/doc_reminder.py');
    });

    it('creates .githooks/pre-push with skill-staleness snippet', async () => {
        await installGitHooks(tmpDir);
        const content = await fsExtra.readFile(path.join(tmpDir, '.githooks', 'pre-push'), 'utf8');
        expect(content).toContain('# [jaggers] skill-staleness');
        expect(content).toContain('.claude/git-hooks/skill_staleness.py');
    });

    it('copies hook scripts into .claude/git-hooks/', async () => {
        await installGitHooks(tmpDir);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'git-hooks', 'doc_reminder.py'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.claude', 'git-hooks', 'skill_staleness.py'))).toBe(true);
    });

    it('activates hooks in .git/hooks/', async () => {
        await installGitHooks(tmpDir);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.git', 'hooks', 'pre-commit'))).toBe(true);
        expect(await fsExtra.pathExists(path.join(tmpDir, '.git', 'hooks', 'pre-push'))).toBe(true);
    });

    it('is idempotent — does not duplicate snippets on re-run', async () => {
        await installGitHooks(tmpDir);
        await installGitHooks(tmpDir);
        const content = await fsExtra.readFile(path.join(tmpDir, '.githooks', 'pre-commit'), 'utf8');
        const count = (content.match(/# \[jaggers\] doc-reminder/g) ?? []).length;
        expect(count).toBe(1);
    });
});
```

**Step 2: Run to verify they fail**

```bash
cd cli && npm test
```

Expected: 5 new tests fail

**Step 3: Add `installGitHooks` to the command file** (before `createInstallServiceSkillsCommand`):

```typescript
export async function installGitHooks(projectRoot: string): Promise<{
    hookFiles: { name: string; status: 'added' | 'already-present' }[];
}> {
    // Copy git-hook scripts into target project (avoids back-reference to jaggers package path)
    const gitHooksSrc = path.join(SKILLS_SRC, 'git-hooks');
    const gitHooksDest = path.join(projectRoot, '.claude', 'git-hooks');
    await fs.copy(gitHooksSrc, gitHooksDest, { overwrite: true });

    const docScript = path.join(projectRoot, '.claude', 'git-hooks', 'doc_reminder.py');
    const stalenessScript = path.join(projectRoot, '.claude', 'git-hooks', 'skill_staleness.py');

    const preCommit = path.join(projectRoot, '.githooks', 'pre-commit');
    const prePush = path.join(projectRoot, '.githooks', 'pre-push');

    for (const hookPath of [preCommit, prePush]) {
        if (!await fs.pathExists(hookPath)) {
            await fs.mkdirp(path.dirname(hookPath));
            await fs.writeFile(hookPath, '#!/usr/bin/env bash\n', { mode: 0o755 });
        }
    }

    const snippets: [string, string, string][] = [
        [
            preCommit,
            MARKER_DOC,
            `\n${MARKER_DOC}\nif command -v python3 &>/dev/null && [ -f "${docScript}" ]; then\n    python3 "${docScript}" || true\nfi\n`,
        ],
        [
            prePush,
            MARKER_STALENESS,
            `\n${MARKER_STALENESS}\nif command -v python3 &>/dev/null && [ -f "${stalenessScript}" ]; then\n    python3 "${stalenessScript}" || true\nfi\n`,
        ],
    ];

    const hookFiles: { name: string; status: 'added' | 'already-present' }[] = [];
    let anyAdded = false;

    for (const [hookPath, marker, snippet] of snippets) {
        const content = await fs.readFile(hookPath, 'utf8');
        const name = path.basename(hookPath);
        if (!content.includes(marker)) {
            await fs.writeFile(hookPath, content + snippet);
            hookFiles.push({ name, status: 'added' });
            anyAdded = true;
        } else {
            hookFiles.push({ name, status: 'already-present' });
        }
    }

    if (anyAdded) {
        const gitHooksDir = path.join(projectRoot, '.git', 'hooks');
        await fs.mkdirp(gitHooksDir);
        for (const [src, name] of [[preCommit, 'pre-commit'], [prePush, 'pre-push']] as const) {
            if (await fs.pathExists(src)) {
                const dest = path.join(gitHooksDir, name);
                await fs.copy(src, dest, { overwrite: true });
                await fs.chmod(dest, 0o755);
            }
        }
    }

    return { hookFiles };
}
```

**Step 4: Run tests**

```bash
cd cli && npm test
```

Expected: all tests pass

**Step 5: Commit**

```bash
git add cli/src/commands/install-service-skills.ts cli/test/install-service-skills.test.ts
git commit -m "feat: add installGitHooks with tests"
```

---

### Task 5: Add `installSettings` + `getProjectRoot`, complete the action, register in index.ts

**Files:**
- Modify: `cli/src/commands/install-service-skills.ts` (add remaining functions, complete action)
- Modify: `cli/src/index.ts` (register subcommand)

**Step 1: Add `installSettings` to the command file** (before `createInstallServiceSkillsCommand`):

```typescript
export async function installSettings(projectRoot: string): Promise<{ added: string[]; skipped: string[] }> {
    const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
    await fs.mkdirp(path.dirname(settingsPath));

    let existing: Record<string, unknown> = {};
    if (await fs.pathExists(settingsPath)) {
        try {
            existing = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
        } catch {
            // malformed JSON — start fresh
        }
    }

    const { result, added, skipped } = mergeSettingsHooks(existing);
    await fs.writeFile(settingsPath, JSON.stringify(result, null, 2) + '\n');
    return { added, skipped };
}
```

**Step 2: Add `getProjectRoot` to the command file** (before `createInstallServiceSkillsCommand`):

Uses `spawnSync` (no shell, matches `preflight.ts` pattern):

```typescript
export function getProjectRoot(pkgRoot: string): string {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        timeout: 5000,
    });
    if (result.status !== 0) {
        throw new Error('Not inside a git repository. Run this command from your target project directory.');
    }
    const root = path.resolve(result.stdout.trim());
    if (root === path.resolve(pkgRoot)) {
        throw new Error('Run this from inside your TARGET project, not the jaggers-agent-tools repo itself.');
    }
    return root;
}
```

**Step 3: Replace the stub action in `createInstallServiceSkillsCommand`**

```typescript
export function createInstallServiceSkillsCommand(): Command {
    return new Command('install-service-skills')
        .description('Install the Service Skill Trinity into the current project')
        .action(async () => {
            let projectRoot: string;
            try {
                projectRoot = getProjectRoot(PKG_ROOT);
            } catch (err) {
                console.error(kleur.red(`\n✗ ${(err as Error).message}\n`));
                process.exit(1);
            }

            console.log(kleur.dim(`\n  Installing into: ${projectRoot}\n`));

            console.log(kleur.bold('── Skills ──────────────────────────────'));
            const skillResults = await installSkills(projectRoot);
            for (const { skill, status } of skillResults) {
                const icon = status === 'installed' ? kleur.green('  ✓') : kleur.yellow('  ↺');
                console.log(`${icon} .claude/skills/${skill}/`);
            }

            console.log(kleur.bold('\n── settings.json ───────────────────────'));
            const { added, skipped } = await installSettings(projectRoot);
            for (const event of added) {
                console.log(`${kleur.green('  ✓')} added hook: ${event}`);
            }
            for (const event of skipped) {
                console.log(`${kleur.yellow('  ○')} already present: ${event} (not overwritten)`);
            }

            console.log(kleur.bold('\n── Git hooks ───────────────────────────'));
            const { hookFiles } = await installGitHooks(projectRoot);
            for (const { name, status } of hookFiles) {
                if (status === 'added') {
                    console.log(`${kleur.green('  ✓')} .githooks/${name}`);
                } else {
                    console.log(`${kleur.yellow('  ○')} already installed: ${name}`);
                }
            }
            if (hookFiles.some(h => h.status === 'added')) {
                console.log(`${kleur.green('  ✓')} activated in .git/hooks/`);
            }
            console.log(`${kleur.green('  ✓')} scripts → .claude/git-hooks/`);

            console.log(kleur.green('\n  Done.'));
            console.log(kleur.dim('  Hooks active: SessionStart · PreToolUse · PostToolUse · pre-commit · pre-push\n'));
        });
}
```

**Step 4: Register in `cli/src/index.ts`**

Add import after the existing command imports:
```typescript
import { createInstallServiceSkillsCommand } from './commands/install-service-skills.js';
```

Add after `program.addCommand(createAddOptionalCommand());`:
```typescript
program.addCommand(createInstallServiceSkillsCommand());
```

**Step 5: Run tests**

```bash
cd cli && npm test
```

Expected: all tests pass

**Step 6: Build**

```bash
cd cli && npm run build
```

Expected: `dist/index.cjs` rebuilt, no errors

**Step 7: Smoke test**

```bash
cd /tmp && mkdir smoke-test && cd smoke-test && git init
node /home/dawid/projects/jaggers-agent-tools/cli/dist/index.cjs install-service-skills
```

Expected: kleur-styled output with all sections (Skills, settings.json, Git hooks), Done message.

**Step 8: Verify `--help` shows new subcommand**

```bash
node /home/dawid/projects/jaggers-agent-tools/cli/dist/index.cjs --help
```

Expected output includes: `install-service-skills  Install the Service Skill Trinity into the current project`

**Step 9: Cleanup and commit**

```bash
rm -rf /tmp/smoke-test
git add cli/src/commands/install-service-skills.ts cli/src/index.ts
git commit -m "feat: wire up install-service-skills command and register in CLI"
```

---

### Task 6: Verify npx invocation from GitHub

**Step 1: Push**

```bash
git push
```

**Step 2: Test from a fresh repo**

```bash
cd /tmp && mkdir npx-test && cd npx-test && git init
npx github:<owner>/jaggers-agent-tools install-service-skills
```

Expected: identical output to local smoke test. Skills in `.claude/skills/`, hooks in `.claude/settings.json`, git hooks in `.githooks/` and `.git/hooks/`.

**Step 3: Cleanup**

```bash
rm -rf /tmp/npx-test
```
