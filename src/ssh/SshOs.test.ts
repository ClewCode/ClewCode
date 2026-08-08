import { describe, expect, test } from 'bun:test';
import { buildRemoteCommand, buildSshArgv, parseRemoteDirListing, SshOs } from './SshOs.js';

describe('buildRemoteCommand', () => {
  test('quotes the command and every argument', () => {
    expect(buildRemoteCommand(undefined, 'rg', ['-n', 'pattern'])).toBe("'rg' '-n' 'pattern'");
  });

  test('a malicious argument stays one argument', () => {
    const command = buildRemoteCommand(undefined, 'cat', ['; rm -rf ~']);
    expect(command).toBe("'cat' '; rm -rf ~'");
    // The semicolon is inside quotes, so the remote shell cannot see it as a
    // command separator.
    expect(command).not.toMatch(/[^']; rm/);
  });

  test('command substitution in an argument is inert', () => {
    expect(buildRemoteCommand(undefined, 'echo', ['$(id)'])).toBe("'echo' '$(id)'");
  });

  test('prefixes the cwd when one is set', () => {
    expect(buildRemoteCommand('/repo', 'ls', [])).toBe("cd '/repo' && 'ls'");
  });
});

describe('buildSshArgv', () => {
  test('disables interactive prompts so a connection cannot hang the agent', () => {
    const argv = buildSshArgv({ host: 'user@host' }, 'ls');
    expect(argv).toContain('BatchMode=yes');
  });

  test('puts the host and remote command last, after any extra flags', () => {
    const argv = buildSshArgv({ host: 'user@host', sshArgs: ['-p', '2222'] }, 'ls -la');
    expect(argv.slice(-2)).toEqual(['user@host', 'ls -la']);
    expect(argv).toContain('-p');
    expect(argv).toContain('2222');
  });
});

describe('parseRemoteDirListing', () => {
  test('reads the type flags and the name', () => {
    expect(parseRemoteDirListing('f\t-\tindex.ts\n-\td\tsrc\n')).toEqual([
      { name: 'index.ts', isFile: true, isDirectory: false },
      { name: 'src', isFile: false, isDirectory: true },
    ]);
  });

  test('keeps a tab inside a filename intact', () => {
    expect(parseRemoteDirListing('f\t-\tweird\tname.txt\n')).toEqual([
      { name: 'weird\tname.txt', isFile: true, isDirectory: false },
    ]);
  });

  test('ignores blank lines', () => {
    expect(parseRemoteDirListing('\n\nf\t-\ta.txt\n\n')).toHaveLength(1);
  });
});

describe('SshOs', () => {
  test('names itself after the host for logs and errors', () => {
    expect(new SshOs({ host: 'user@example.com' }).name).toBe('ssh:user@example.com');
  });

  test('treats the remote as posix regardless of the local platform', () => {
    expect(new SshOs({ host: 'h' }).platform).toBe('posix');
  });

  test('resolves relative paths against the remote cwd', () => {
    expect(new SshOs({ host: 'h', cwd: '/srv/app' }).resolve('src/main.ts')).toBe('/srv/app/src/main.ts');
  });

  test('refuses to reach a host after dispose', async () => {
    const os = new SshOs({ host: 'h', cwd: '/srv' });
    await os.dispose();
    await expect(os.exists('/tmp')).rejects.toThrow(/disposed/);
  });
});
