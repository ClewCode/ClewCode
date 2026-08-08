/**
 * {@link RemoteOs} over the system `ssh` client.
 *
 * Deliberately no ssh library: clew already requires a working `ssh` on PATH
 * for its remote flows, and reusing it inherits the user's `~/.ssh/config`,
 * agent, jump hosts, and key handling for free. A library would mean a new
 * native dependency and a second, divergent notion of "how do I reach this
 * host".
 *
 * Every operation is one `ssh host <command>` invocation. File contents move
 * base64-encoded so arbitrary bytes survive a text channel intact.
 */
import { spawn } from 'child_process';
import { collectProcessOutput } from './LocalOs.js';
import type { ExecOptions, ExecResult, RemoteDirEntry, RemoteOs, RemoteStat } from './RemoteOs.js';
import { assertRemoteOs, RemoteOsError } from './RemoteOs.js';
import { resolveFor, shellQuoteArgsPosix, shellQuotePosix, type TargetPlatform, withRemoteCwd } from './remotePath.js';

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

export type SshOsOptions = {
  /** `host` or `user@host`, as `ssh` itself would take it. */
  host: string;
  /** Starting working directory on the remote. Defaults to the login directory. */
  cwd?: string;
  /** Extra flags for the ssh client (`-p 2222`, `-i key`, `-J jump`). */
  sshArgs?: readonly string[];
  /** ssh binary to invoke. Overridable for tests and unusual installs. */
  sshBinary?: string;
};

/**
 * Build the remote shell command for one operation.
 *
 * Exported for tests: command construction is where a quoting mistake becomes
 * a remote injection, so it is verified directly rather than only through a
 * live connection.
 */
export function buildRemoteCommand(cwd: string | undefined, command: string, args: readonly string[]): string {
  const quoted = [command, ...args].map(shellQuotePosix).join(' ');
  return withRemoteCwd(cwd, quoted);
}

/** Full `ssh` argv for a remote command. Exported for tests. */
export function buildSshArgv(options: SshOsOptions, remoteCommand: string): string[] {
  return [
    // Never block on an interactive prompt: a hung `ssh` waiting for a password
    // or a host-key confirmation would look like a frozen agent.
    '-o',
    'BatchMode=yes',
    ...(options.sshArgs ?? []),
    options.host,
    remoteCommand,
  ];
}

export class SshOs implements RemoteOs {
  readonly name: string;
  /** Remote is assumed POSIX — the command set below is POSIX-only anyway. */
  readonly platform: TargetPlatform = 'posix';

  private currentCwd: string;
  private disposed = false;

  constructor(private readonly options: SshOsOptions) {
    this.name = `ssh:${options.host}`;
    this.currentCwd = options.cwd ?? '';
  }

  cwd(): string {
    return this.currentCwd;
  }

  async chdir(path: string): Promise<void> {
    // Resolve on the remote rather than locally: `pwd -P` follows the target's
    // own symlinks and tells us what it actually landed on.
    const result = await this.runRemote(`cd ${shellQuotePosix(path)} && pwd -P`, {});
    if (result.exitCode !== 0) {
      throw new RemoteOsError(`Cannot chdir to ${path} on ${this.name}: ${result.stderr.trim() || 'command failed'}`);
    }
    this.currentCwd = result.stdout.trim();
  }

  resolve(path: string): string {
    return resolveFor(this.platform, this.currentCwd, path);
  }

  async stat(path: string): Promise<RemoteStat> {
    // `stat -c` is GNU; BusyBox and macOS differ. Use `-c` and fall back to a
    // shell-only probe so this works on the widest set of hosts.
    const target = shellQuotePosix(path);
    const command =
      `if [ -e ${target} ] || [ -L ${target} ]; then ` +
      `printf '%s\\n' ` +
      `"$( [ -f ${target} ] && echo f || echo - )" ` +
      `"$( [ -d ${target} ] && echo d || echo - )" ` +
      `"$( [ -L ${target} ] && echo l || echo - )" ` +
      `"$(wc -c < ${target} 2>/dev/null || echo 0)"; ` +
      `else exit 44; fi`;
    const result = await this.runRemote(command, {});
    if (result.exitCode === 44) {
      throw new RemoteOsError(`Cannot stat ${path} on ${this.name}: no such file`);
    }
    if (result.exitCode !== 0) {
      throw new RemoteOsError(`Cannot stat ${path} on ${this.name}: ${result.stderr.trim() || 'command failed'}`);
    }
    const [isFile, isDirectory, isSymlink, size] = result.stdout.trim().split(/\s+/);
    return {
      size: Number.parseInt(size ?? '0', 10) || 0,
      isFile: isFile === 'f',
      isDirectory: isDirectory === 'd',
      isSymbolicLink: isSymlink === 'l',
    };
  }

  async exists(path: string): Promise<boolean> {
    const result = await this.runRemote(`test -e ${shellQuotePosix(path)}`, {});
    return result.exitCode === 0;
  }

  async readFile(path: string): Promise<Buffer> {
    // base64 so binary content survives the text channel unmangled.
    const result = await this.runRemote(`base64 < ${shellQuotePosix(path)}`, {});
    if (result.exitCode !== 0) {
      throw new RemoteOsError(`Cannot read ${path} on ${this.name}: ${result.stderr.trim() || 'command failed'}`);
    }
    return Buffer.from(result.stdout.replaceAll(/\s+/g, ''), 'base64');
  }

  async readText(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    return (await this.readFile(path)).toString(encoding);
  }

  async writeFile(path: string, data: Buffer | string): Promise<void> {
    const payload = (Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')).toString('base64');
    // The payload goes over stdin, not the command line: an argv has a hard
    // length limit that a real file would blow past immediately.
    const result = await this.runRemote(`base64 -d > ${shellQuotePosix(path)}`, { stdin: payload });
    if (result.exitCode !== 0) {
      throw new RemoteOsError(`Cannot write ${path} on ${this.name}: ${result.stderr.trim() || 'command failed'}`);
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const flag = options?.recursive ? '-p ' : '';
    const result = await this.runRemote(`mkdir ${flag}${shellQuotePosix(path)}`, {});
    if (result.exitCode !== 0) {
      throw new RemoteOsError(
        `Cannot create directory ${path} on ${this.name}: ${result.stderr.trim() || 'command failed'}`,
      );
    }
  }

  async readdir(path: string): Promise<RemoteDirEntry[]> {
    const dir = shellQuotePosix(path);
    // -A skips . and .. but keeps dotfiles; the type probe runs per entry so a
    // name with spaces or newlines still maps to exactly one output record.
    const command =
      `cd ${dir} && for entry in $(ls -A); do ` +
      `printf '%s\\t%s\\t%s\\n' ` +
      `"$( [ -f "$entry" ] && echo f || echo - )" ` +
      `"$( [ -d "$entry" ] && echo d || echo - )" ` +
      `"$entry"; done`;
    const result = await this.runRemote(command, {});
    if (result.exitCode !== 0) {
      throw new RemoteOsError(`Cannot list ${path} on ${this.name}: ${result.stderr.trim() || 'command failed'}`);
    }
    return parseRemoteDirListing(result.stdout);
  }

  async exec(command: string, args: readonly string[], options?: ExecOptions): Promise<ExecResult> {
    const env = options?.env
      ? `${Object.entries(options.env)
          .map(([key, value]) => `${key}=${shellQuotePosix(value)}`)
          .join(' ')} `
      : '';
    const remoteCommand = withRemoteCwd(
      options?.cwd ?? this.currentCwd,
      `${env}${shellQuoteArgsPosix([command, ...args])}`,
    );
    return this.runRemote(remoteCommand, options ?? {}, { skipCwd: true });
  }

  async dispose(): Promise<void> {
    // Each operation is its own ssh process, so there is no persistent channel
    // to tear down. Marked so a disposed instance fails loudly instead of
    // silently opening new connections.
    this.disposed = true;
  }

  /** Run one already-built remote command line through the ssh client. */
  private async runRemote(
    remoteCommand: string,
    options: ExecOptions & { stdin?: string },
    control?: { skipCwd?: boolean },
  ): Promise<ExecResult> {
    if (this.disposed) {
      throw new RemoteOsError(`${this.name} has been disposed`);
    }
    const withCwd = control?.skipCwd ? remoteCommand : withRemoteCwd(this.currentCwd, remoteCommand);
    const child = spawn(this.options.sshBinary ?? 'ssh', buildSshArgv(this.options, withCwd), { shell: false });
    if (options.stdin !== undefined) {
      child.stdin?.end(options.stdin);
    } else {
      // Close stdin so a remote command that reads it sees EOF instead of
      // hanging forever on a channel nobody will write to.
      child.stdin?.end();
    }
    return collectProcessOutput(child, options.maxBuffer ?? DEFAULT_MAX_BUFFER, options);
  }
}

assertRemoteOs(SshOs);

/** Parse the `<file>\t<dir>\t<name>` records emitted by {@link SshOs.readdir}. */
export function parseRemoteDirListing(stdout: string): RemoteDirEntry[] {
  const entries: RemoteDirEntry[] = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const [isFile, isDirectory, ...nameParts] = line.split('\t');
    const name = nameParts.join('\t');
    if (!name) continue;
    entries.push({ name, isFile: isFile === 'f', isDirectory: isDirectory === 'd' });
  }
  return entries;
}
