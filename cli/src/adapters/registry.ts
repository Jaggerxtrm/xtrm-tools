import { ToolAdapter } from './base.js';
import { ClaudeAdapter } from './claude.js';

/**
 * Adapter registry for Claude Code only.
 * 
 * ARCHITECTURAL DECISION (v2.0.0): xtrm-tools now supports Claude Code exclusively.
 * Gemini and Qwen adapters were removed due to fragile, undocumented hook ecosystems.
 * See PROJECT-SKILLS-ARCHITECTURE.md Section 3.1 for details.
 */

export function detectAdapter(systemRoot: string): ToolAdapter | null {
    // Windows compatibility: Normalize backslashes before matching paths
    const normalized = systemRoot.replace(/\\/g, '/').toLowerCase();

    if (normalized.includes('.claude') || normalized.includes('/claude')) {
        return new ClaudeAdapter(systemRoot);
    }

    return null;
}
