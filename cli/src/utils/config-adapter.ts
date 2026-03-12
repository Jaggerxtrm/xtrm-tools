import path from 'path';
import os from 'os';

/**
 * ConfigAdapter for Claude Code only.
 * 
 * ARCHITECTURAL DECISION (v2.0.0): xtrm-tools now supports Claude Code exclusively.
 * Hook translation for Gemini/Qwen was removed due to fragile, undocumented ecosystems.
 * See PROJECT-SKILLS-ARCHITECTURE.md Section 3.1 for details.
 */
export class ConfigAdapter {
    systemRoot: string;
    homeDir: string;
    hooksDir: string;

    constructor(systemRoot: string) {
        this.systemRoot = systemRoot;
        this.homeDir = os.homedir();
        this.hooksDir = path.join(this.systemRoot, 'hooks');
    }

    /**
     * Adapt hooks config for Claude Code format.
     * Transforms flat hook definitions into Claude's wrapped format.
     */
    adaptHooksConfig(canonicalHooks: any): any {
        if (!canonicalHooks) return {};

        const hooksConfig = JSON.parse(JSON.stringify(canonicalHooks));
        this.resolveHookScripts(hooksConfig);
        return hooksConfig;
    }

    /**
     * Resolve hook script paths and transform into Claude's command format.
     * Converts { script: "foo.py" } → { type: "command", command: "python3 /full/path/foo.py" }
     */
    resolveHookScripts(hooksConfig: any): void {
        if (hooksConfig.hooks) {
            for (const [event, hooks] of Object.entries(hooksConfig.hooks)) {
                if (Array.isArray(hooks)) {
                    // Transform flat hooks into Claude's wrapped format:
                    // { matcher?, hooks: [{ type, command, timeout }] }
                    hooksConfig.hooks[event] = hooks.map((hook: any) => {
                        if (hook.script) {
                            const resolvedScriptPath = this.resolvePath(path.join(this.hooksDir, hook.script));
                            const command = this.buildScriptCommand(hook.script, resolvedScriptPath);
                            const innerHook: any = { type: "command", command };
                            if (hook.timeout) innerHook.timeout = hook.timeout;

                            const wrapper: any = { hooks: [innerHook] };
                            if (hook.matcher) wrapper.matcher = hook.matcher;
                            return wrapper;
                        }
                        return hook;
                    });
                }
            }
        }
        if (hooksConfig.statusLine && hooksConfig.statusLine.script) {
            const resolvedScriptPath = this.resolvePath(path.join(this.hooksDir, hooksConfig.statusLine.script));
            const command = this.buildScriptCommand(hooksConfig.statusLine.script, resolvedScriptPath);
            hooksConfig.statusLine = { type: "command", command };
        }
    }

    buildScriptCommand(scriptName: string, resolvedPath: string): string {
        const ext = path.extname(scriptName).toLowerCase();
        if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
            return `node "${resolvedPath}"`;
        } else if (ext === '.sh') {
            return `bash "${resolvedPath}"`;
        } else {
            const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
            return `${pythonBin} "${resolvedPath}"`;
        }
    }

    resolvePath(p: string): string {
        if (!p || typeof p !== 'string') return p;
        let resolved = p.replace(/~\//g, this.homeDir + '/').replace(/\${HOME}/g, this.homeDir);

        // Windows compatibility: use forward slashes in config files
        if (process.platform === 'win32') {
            resolved = resolved.replace(/\\/g, '/');
        }

        return resolved;
    }
}
