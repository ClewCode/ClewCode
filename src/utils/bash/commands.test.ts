import { describe, expect, it } from 'bun:test';
import { isHelpCommand, splitCommand_DEPRECATED, splitCommandWithOperators } from './commands.js';

describe('bash commands splitting', () => {
  it('splits sequential commands with operators included', () => {
    const res = splitCommandWithOperators('git status; npm test && ls -la');
    expect(res).toContain('git status');
    expect(res).toContain(';');
    expect(res).toContain('npm test');
    expect(res).toContain('&&');
    expect(res).toContain('ls -la');
  });

  it('preserves quotes inside command arguments', () => {
    const res = splitCommandWithOperators('git commit -m "feat: add basic tools"');
    expect(res.length).toBe(1);
    expect(res[0]).toBe('git commit -m "feat: add basic tools"');
  });

  it('filters operators and returns only executable commands via splitCommand_DEPRECATED', () => {
    const legacy = splitCommand_DEPRECATED('echo hello && echo world');
    expect(legacy).toEqual(['echo hello', 'echo world']);
  });
});

describe('isHelpCommand', () => {
  it('identifies strict --help commands correctly', () => {
    expect(isHelpCommand('git --help')).toBe(true);
    expect(isHelpCommand('npm install --help')).toBe(true);
    expect(isHelpCommand('git commit -m "test"')).toBe(false);
    expect(isHelpCommand('git --help; rm -rf /')).toBe(false);
  });
});
