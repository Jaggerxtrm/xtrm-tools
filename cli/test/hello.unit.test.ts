import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHelloCommand } from '../src/commands/hello.js';

describe('createHelloCommand (xtrm-wdt7.3)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns a Command named "hello"', () => {
        const cmd = createHelloCommand();
        expect(cmd.name()).toBe('hello');
    });

    it('has a description', () => {
        const cmd = createHelloCommand();
        expect(cmd.description()).toBeTruthy();
    });

    it('writes "Hello\\n" to stdout when action runs', () => {
        const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const cmd = createHelloCommand();
        cmd.parseAsync([], { from: 'user' });
        expect(write).toHaveBeenCalledWith('Hello\n');
    });
});
