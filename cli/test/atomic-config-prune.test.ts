import { describe, it, expect } from 'vitest';
import { deepMergeWithProtection } from '../src/utils/atomic-config.js';

const hooksDir = '/home/user/.claude/hooks';
const cmd = (script: string) => `node "${hooksDir}/${script}"`;

function wrap(matcher: string, script: string, timeout = 5000) {
    return { matcher, hooks: [{ type: 'command', command: cmd(script), timeout }] };
}

function wrapNoMatcher(script: string) {
    return { hooks: [{ type: 'command', command: cmd(script) }] };
}

const canonicalHooks = {
    SessionStart: [wrapNoMatcher('beads-compact-restore.mjs'), wrapNoMatcher('serena-workflow-reminder.py')],
    UserPromptSubmit: [{ ...wrapNoMatcher('branch-state.mjs'), timeout: 3000 }],
    PreToolUse: [
        wrap('Write|Edit|MultiEdit|mcp__serena__rename_symbol|mcp__serena__replace_symbol_body|mcp__serena__insert_after_symbol|mcp__serena__insert_before_symbol', 'main-guard.mjs'),
        wrap('Bash', 'main-guard.mjs'),
    ],
    PostToolUse: [
        wrap('Bash|mcp__serena__find_symbol|mcp__serena__get_symbols_overview', 'gitnexus/gitnexus-hook.cjs', 10000),
    ],
};

describe('deepMergeWithProtection — pruneHooks mode', () => {
    it('replaces stale PreToolUse matcher with canonical one', () => {
        const existing = {
            hooks: {
                PreToolUse: [
                    wrap('Read|Grep|Glob|Write|Edit|MultiEdit|mcp__serena__rename_symbol|mcp__serena__replace_symbol_body|mcp__serena__insert_after_symbol|mcp__serena__insert_before_symbol', 'main-guard.mjs'),
                    wrap('Bash', 'main-guard.mjs'),
                ],
            },
        };

        const result = deepMergeWithProtection(existing, { hooks: canonicalHooks }, '', { pruneHooks: true });
        const preToolUse = result.hooks.PreToolUse;
        expect(preToolUse).toHaveLength(2);
        expect(preToolUse[0].matcher).toBe('Write|Edit|MultiEdit|mcp__serena__rename_symbol|mcp__serena__replace_symbol_body|mcp__serena__insert_after_symbol|mcp__serena__insert_before_symbol');
        expect(preToolUse[1].matcher).toBe('Bash');
    });

    it('removes script wired to wrong event (serena-workflow-reminder.py in PreToolUse)', () => {
        const existing = {
            hooks: {
                SessionStart: [wrapNoMatcher('serena-workflow-reminder.py')],
                PreToolUse: [
                    wrap('Read|Edit', 'serena-workflow-reminder.py'),
                    wrap('Write|Edit|MultiEdit|mcp__serena__rename_symbol|mcp__serena__replace_symbol_body|mcp__serena__insert_after_symbol|mcp__serena__insert_before_symbol', 'main-guard.mjs'),
                    wrap('Bash', 'main-guard.mjs'),
                ],
            },
        };

        const result = deepMergeWithProtection(existing, { hooks: canonicalHooks }, '', { pruneHooks: true });
        const preToolUse = result.hooks.PreToolUse;
        const hasStale = preToolUse.some((w: any) =>
            w.hooks?.some((h: any) => h.command?.includes('serena-workflow-reminder.py'))
        );
        expect(hasStale).toBe(false);
        expect(preToolUse).toHaveLength(2);
    });

    it('preserves user-local hooks (not from ~/.claude/hooks/) in canonical events', () => {
        const userLocalHook = { hooks: [{ type: 'command', command: '/usr/local/bin/my-custom-hook.sh' }] };
        const existing = {
            hooks: {
                PreToolUse: [
                    wrap('Bash', 'main-guard.mjs'),
                    userLocalHook,
                ],
            },
        };

        const result = deepMergeWithProtection(existing, { hooks: canonicalHooks }, '', { pruneHooks: true });
        const preToolUse = result.hooks.PreToolUse;
        const hasUserLocal = preToolUse.some((w: any) =>
            w.hooks?.some((h: any) => h.command === '/usr/local/bin/my-custom-hook.sh')
        );
        expect(hasUserLocal).toBe(true);
    });

    it('normal merge (no pruneHooks) preserves stale matcher tokens', () => {
        const existing = {
            hooks: {
                PreToolUse: [
                    wrap('Read|Grep|Glob|Write|Edit|Bash', 'main-guard.mjs'),
                ],
            },
        };

        const result = deepMergeWithProtection(existing, { hooks: canonicalHooks }, '', { pruneHooks: false });
        const preToolUse = result.hooks.PreToolUse;
        const matcher = preToolUse.find((w: any) =>
            w.hooks?.some((h: any) => h.command?.includes('main-guard.mjs'))
        )?.matcher ?? '';
        expect(matcher).toContain('Read');
    });
});
