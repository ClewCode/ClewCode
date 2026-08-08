import { describe, expect, test } from 'bun:test';
import {
  isAbsoluteFor,
  isInsideFor,
  joinFor,
  normalizeFor,
  resolveFor,
  shellQuoteArgsPosix,
  shellQuotePosix,
  withRemoteCwd,
} from './remotePath.js';

describe('target-aware path operations', () => {
  test('joins with the target separator, not the local one', () => {
    expect(joinFor('posix', '/repo', 'src', 'index.ts')).toBe('/repo/src/index.ts');
    expect(joinFor('win32', 'D:\\repo', 'src', 'index.ts')).toBe('D:\\repo\\src\\index.ts');
  });

  test('a posix target never produces backslash separators', () => {
    expect(joinFor('posix', '/repo', 'a', 'b')).not.toContain('\\');
  });

  test('absoluteness follows the target', () => {
    // A Windows drive path is not absolute on a Linux host, and vice versa.
    expect(isAbsoluteFor('posix', 'D:\\repo')).toBe(false);
    expect(isAbsoluteFor('posix', '/repo')).toBe(true);
    expect(isAbsoluteFor('win32', 'D:\\repo')).toBe(true);
  });

  test('normalize collapses traversal per target', () => {
    expect(normalizeFor('posix', '/repo/src/../lib')).toBe('/repo/lib');
    expect(normalizeFor('win32', 'D:\\repo\\src\\..\\lib')).toBe('D:\\repo\\lib');
  });
});

describe('resolveFor', () => {
  test('resolves relative paths against the target cwd', () => {
    expect(resolveFor('posix', '/repo', 'src/index.ts')).toBe('/repo/src/index.ts');
  });

  test('leaves absolute paths alone', () => {
    expect(resolveFor('posix', '/repo', '/etc/hosts')).toBe('/etc/hosts');
  });

  test('refuses a relative path with no target cwd instead of using the local one', () => {
    expect(() => resolveFor('posix', '', 'src/index.ts')).toThrow(/without a target cwd/);
  });
});

describe('isInsideFor', () => {
  test('accepts paths under the root and the root itself', () => {
    expect(isInsideFor('posix', '/repo', '/repo/src/a.ts')).toBe(true);
    expect(isInsideFor('posix', '/repo', '/repo')).toBe(true);
  });

  test('rejects escapes through traversal', () => {
    expect(isInsideFor('posix', '/repo', '/repo/../etc/passwd')).toBe(false);
  });

  test('rejects a sibling with the root as a name prefix', () => {
    expect(isInsideFor('posix', '/repo', '/repo-secrets/key')).toBe(false);
  });
});

describe('shellQuotePosix', () => {
  test('neutralizes command substitution and expansion', () => {
    expect(shellQuotePosix('$(whoami)')).toBe("'$(whoami)'");
    expect(shellQuotePosix('a b; rm -rf /')).toBe("'a b; rm -rf /'");
    expect(shellQuotePosix('$HOME')).toBe("'$HOME'");
  });

  test('escapes embedded single quotes so the quoting cannot be broken out of', () => {
    // Close the quote, emit an escaped quote, reopen: 'it' \' 's'
    expect(shellQuotePosix("it's")).toBe(`'it'\\''s'`);
  });

  test('quotes every argument in a command line', () => {
    expect(shellQuoteArgsPosix(['rg', '-n', 'foo bar'])).toBe("'rg' '-n' 'foo bar'");
  });
});

describe('withRemoteCwd', () => {
  test('prefixes a cd because ssh has no per-connection working directory', () => {
    expect(withRemoteCwd('/repo', 'ls')).toBe("cd '/repo' && ls");
  });

  test('quotes the directory', () => {
    expect(withRemoteCwd('/tmp/a b', 'ls')).toBe("cd '/tmp/a b' && ls");
  });

  test('uses && so a failed cd aborts rather than running in the wrong directory', () => {
    expect(withRemoteCwd('/repo', 'make')).toContain('&&');
    expect(withRemoteCwd('/repo', 'make')).not.toContain(';');
  });

  test('passes the command through untouched when there is no cwd', () => {
    expect(withRemoteCwd(undefined, 'ls')).toBe('ls');
    expect(withRemoteCwd('', 'ls')).toBe('ls');
  });
});
