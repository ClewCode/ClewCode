import { describe, expect, test } from 'bun:test';
import {
  cwdMarker,
  extractCwdReport,
  isAbsoluteFor,
  isInsideFor,
  joinFor,
  normalizeFor,
  quoteCdTarget,
  resolveFor,
  shellQuoteArgsPosix,
  shellQuotePosix,
  withCwdReport,
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

describe('quoteCdTarget', () => {
  test('keeps ~ expandable instead of quoting it into a literal directory name', () => {
    // `cd '~/repo'` looks for a directory actually named `~`.
    expect(quoteCdTarget('~/repo')).toBe("$HOME/'repo'");
    expect(quoteCdTarget('~')).toBe('$HOME');
    expect(quoteCdTarget('~/')).toBe('$HOME');
  });

  test('still quotes the part after the home prefix', () => {
    expect(quoteCdTarget('~/my repo; rm -rf /')).toBe("$HOME/'my repo; rm -rf /'");
  });

  test('quotes an absolute path as before', () => {
    expect(quoteCdTarget('/srv/app')).toBe("'/srv/app'");
  });

  test('treats ~user as a literal, since expanding it needs the remote passwd db', () => {
    expect(quoteCdTarget('~alice/repo')).toBe("'~alice/repo'");
  });
});

describe('cwd reporting', () => {
  const session = 'abc123';

  test('round-trips the directory the command ended in', () => {
    const wrapped = withCwdReport(session, 'cd build && make');
    expect(wrapped).toContain('pwd');

    const stdout = `building...\n\n${cwdMarker(session)}/srv/app/build${cwdMarker(session)}\n`;
    const report = extractCwdReport(session, stdout);

    expect(report.cwd).toBe('/srv/app/build');
    // The command's own trailing newline survives; only the injected one goes.
    expect(report.output).toBe('building...\n');
  });

  test('preserves the command exit status across the appended pwd', () => {
    const wrapped = withCwdReport(session, 'false');
    expect(wrapped).toContain('__clew_status=$?');
    expect(wrapped.trimEnd().endsWith('exit $__clew_status')).toBe(true);
  });

  test('reports the directory even when the command failed', () => {
    // The marker is joined with a newline, not &&, so a failure still reports.
    expect(withCwdReport(session, 'false')).not.toContain('&& printf');
  });

  test('output with no marker is returned untouched', () => {
    // A killed or timed-out command never reaches the printf; losing its
    // output would be far worse than losing the cwd update.
    const report = extractCwdReport(session, 'partial output, then killed');
    expect(report.output).toBe('partial output, then killed');
    expect(report.cwd).toBeUndefined();
  });

  test('a marker echoed by the command itself does not beat the real one', () => {
    const stdout =
      `${cwdMarker(session)}/fake${cwdMarker(session)}\n` + `real\n\n${cwdMarker(session)}/srv${cwdMarker(session)}\n`;
    expect(extractCwdReport(session, stdout).cwd).toBe('/srv');
  });

  test('another session cannot claim this session marker', () => {
    const stdout = `x\n\n${cwdMarker('other')}/elsewhere${cwdMarker('other')}\n`;
    const report = extractCwdReport(session, stdout);
    expect(report.cwd).toBeUndefined();
    expect(report.output).toBe(stdout);
  });

  test('strips the injected newline, not the command own trailing one', () => {
    const stdout = `line1\n\n${cwdMarker(session)}/srv${cwdMarker(session)}\n`;
    // Exactly one newline back — no spurious blank line where the marker was.
    expect(extractCwdReport(session, stdout).output).toBe('line1\n');
  });

  test('a command whose output had no trailing newline gains none', () => {
    const stdout = `no-newline\n${cwdMarker(session)}/srv${cwdMarker(session)}\n`;
    expect(extractCwdReport(session, stdout).output).toBe('no-newline');
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
