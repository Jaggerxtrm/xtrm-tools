import { describe, it, expect } from 'vitest';
import { createInstallPiCommand } from '../src/commands/install-pi.js';

describe('createInstallPiCommand', () => {
    it('exports a createInstallPiCommand function', () => {
        expect(typeof createInstallPiCommand).toBe('function');
    });

    it('returns a Command named "pi"', () => {
        const cmd = createInstallPiCommand();
        expect((cmd as any).name()).toBe('pi');
    });

    it('fillTemplate replaces {{PLACEHOLDERS}} with values', async () => {
        const { fillTemplate } = await import('../src/commands/install-pi.js');
        expect(fillTemplate('{"k":"{{MY_KEY}}"}' , { MY_KEY: 'abc' })).toBe('{"k":"abc"}');
    });

    it('fillTemplate leaves missing placeholders empty', async () => {
        const { fillTemplate } = await import('../src/commands/install-pi.js');
        expect(fillTemplate('{"k":"{{MISSING}}"}', {})).toBe('{"k":""}');
    });

    it('models.json.template contains {{DASHSCOPE_API_KEY}}', () => {
        const fs = require('node:fs');
        const p = require('node:path');
        const content = fs.readFileSync(p.resolve(__dirname, '..', '..', 'config', 'pi', 'models.json.template'), 'utf8');
        expect(content).toContain('{{DASHSCOPE_API_KEY}}');
    });

    it('auth.json.template contains {{DASHSCOPE_API_KEY}} and {{ZAI_API_KEY}}', () => {
        const fs = require('node:fs');
        const p = require('node:path');
        const content = fs.readFileSync(p.resolve(__dirname, '..', '..', 'config', 'pi', 'auth.json.template'), 'utf8');
        expect(content).toContain('{{DASHSCOPE_API_KEY}}');
        expect(content).toContain('{{ZAI_API_KEY}}');
    });

    it('auth.json.template contains no real API keys or tokens', () => {
        const fs = require('node:fs');
        const p = require('node:path');
        const content = fs.readFileSync(p.resolve(__dirname, '..', '..', 'config', 'pi', 'auth.json.template'), 'utf8');
        expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
        expect(content).not.toMatch(/ya29\.[a-zA-Z0-9_-]{20,}/);
    });

    it('settings.json.template includes pi-serena-tools package', () => {
        const fs = require('node:fs');
        const p = require('node:path');
        const settings = JSON.parse(fs.readFileSync(p.resolve(__dirname, '..', '..', 'config', 'pi', 'settings.json.template'), 'utf8'));
        expect(settings.packages).toContain('npm:pi-serena-tools');
    });

    it('install-schema.json defines DASHSCOPE_API_KEY and ZAI_API_KEY fields', () => {
        const fs = require('node:fs');
        const p = require('node:path');
        const schema = JSON.parse(fs.readFileSync(p.resolve(__dirname, '..', '..', 'config', 'pi', 'install-schema.json'), 'utf8'));
        const keys = schema.fields.map((f) => f.key);
        expect(keys).toContain('DASHSCOPE_API_KEY');
        expect(keys).toContain('ZAI_API_KEY');
    });

    it('install-schema.json lists anthropic and qwen-cli as oauth_providers', () => {
        const fs = require('node:fs');
        const p = require('node:path');
        const schema = JSON.parse(fs.readFileSync(p.resolve(__dirname, '..', '..', 'config', 'pi', 'install-schema.json'), 'utf8'));
        const keys = schema.oauth_providers.map((o) => o.key);
        expect(keys).toContain('anthropic');
        expect(keys).toContain('qwen-cli');
    });

    it('extensions directory contains all expected .ts files', () => {
        const fs = require('node:fs');
        const p = require('node:path');
        const extDir = p.resolve(__dirname, '..', '..', 'config', 'pi', 'extensions');
        const files = ['auto-session-name.ts','auto-update.ts','bg-process.ts','compact-header.ts','custom-footer.ts','git-checkpoint.ts','git-guard.ts','safe-guard.ts','todo.ts'];
        for (const f of files) expect(fs.existsSync(p.join(extDir, f))).toBe(true);
    });

    it('custom-provider-qwen-cli extension has index.ts and package.json', () => {
        const fs = require('node:fs');
        const p = require('node:path');
        const base = p.resolve(__dirname, '..', '..', 'config', 'pi', 'extensions', 'custom-provider-qwen-cli');
        expect(fs.existsSync(p.join(base, 'index.ts'))).toBe(true);
        expect(fs.existsSync(p.join(base, 'package.json'))).toBe(true);
    });
});
