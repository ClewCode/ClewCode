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
import { createHash, randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join as posixJoin } from 'path/posix';
import { collectProcessOutput } from './LocalOs.js';
import type { ExecOptions, ExecResult, RemoteDirEntry, RemoteOs, RemoteStat } from './RemoteOs.js';
import { assertRemoteOs, RemoteOsError } from './RemoteOs.js';
import {
  extractCwdReport,
  resolveFor,
  shellQuoteArgsPosix,
  shellQuotePosix,
  type TargetPlatform,
  withCwdReport,
  withRemoteCwd,
} from './remotePath.js';

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
  /**
   * Arguments placed before ssh's own flags, for wrapper commands —
   * `sshpass -p secret ssh …` or `gcloud compute ssh …`, where the binary that
   * runs is not `ssh` itself and needs its own leading arguments.
   */
  sshBinaryArgs?: readonly string[];
  /**
   * Seconds a shared connection lingers after the last command (ControlPersist).
   * Set to 0 to disable connection reuse entirely.
   */
  controlPersistSeconds?: number;
  /** Override the control socket path. Defaults to a hashed path under the temp dir. */
  controlPath?: string;
};

const DEFAULT_CONTROL_PERSIST_SECONDS = 300;

/**
 * Path for the shared connection's control socket.
 *
 * A unix socket path has a hard length limit — 104 bytes on macOS — that a
 * host name plus a temp directory reaches easily, so the identity is hashed
 * to a short fixed width. The hash is derived only from stable inputs, so a
 * reconnect lands on the same socket and reuses the existing master.
 */
export function controlSocketPath(options: SshOsOptions): string {
  if (options.controlPath) {
    return options.controlPath;
  }
  const identity = [options.host, ...(options.sshArgs ?? [])].join(' ');
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 16);
  return posixJoin(tmpdir(), `clew-ssh-${digest}`);
}

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
  const persist = options.controlPersistSeconds ?? DEFAULT_CONTROL_PERSIST_SECONDS;
  // Without connection reuse every operation pays a fresh TCP handshake, key
  // exchange, and authentication — reading ten files means ten logins. The
  // master is set up by whichever command arrives first and lingers for
  // `ControlPersist`, so the rest ride the open channel.
  const controlArgs =
    persist > 0
      ? [
          '-o',
          'ControlMaster=auto',
          '-o',
          `ControlPath=${controlSocketPath(options)}`,
          '-o',
          `ControlPersist=${persist}`,
        ]
      : [];
  return [
    ...(options.sshBinaryArgs ?? []),
    // Never block on an interactive prompt: a hung `ssh` waiting for a password
    // or a host-key confirmation would look like a frozen agent.
    '-o',
    'BatchMode=yes',
    ...controlArgs,
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
  /** Distinguishes this session's cwd markers from a nested run's. */
  private readonly sessionId: string;

  constructor(private readonly options: SshOsOptions) {
    this.name = `ssh:${options.host}`;
    this.currentCwd = options.cwd ?? '';
    this.sessionId = randomUUID().replaceAll('-', '').slice(0, 12);
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
    // Globs, not `$(ls -A)`: command substitution word-splits on whitespace, so
    // a file named `my notes.txt` would come back as two bogus entries. `* .*`
    // covers dotfiles; unmatched globs stay literal, hence the existence guard.
    const command =
      `cd ${dir} && for entry in * .*; do ` +
      `[ "$entry" = "." ] && continue; ` +
      `[ "$entry" = ".." ] && continue; ` +
      `{ [ -e "$entry" ] || [ -L "$entry" ]; } || continue; ` +
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
    // Only the session's own cwd tracks a `cd` the command performs; a caller
    // that pinned `options.cwd` asked for that directory specifically and must
    // not have the session dragged along behind it.
    const tracksCwd = options?.cwd === undefined;
    const inner = withRemoteCwd(options?.cwd ?? this.currentCwd, `${env}${shellQuoteArgsPosix([command, ...args])}`);
    const remoteCommand = tracksCwd ? withCwdReport(this.sessionId, inner) : inner;

    const result = await this.runRemote(remoteCommand, options ?? {}, { skipCwd: true });
    if (!tracksCwd) {
      return result;
    }
    const report = extractCwdReport(this.sessionId, result.stdout);
    if (report.cwd) {
      this.currentCwd = report.cwd;
    }
    return { ...result, stdout: report.output };
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const persist = this.options.controlPersistSeconds ?? DEFAULT_CONTROL_PERSIST_SECONDS;
    if (persist <= 0) {
      return;
    }
    // Ask the shared connection to exit rather than leaving it to idle out.
    // Failure is fine: ControlPersist expires on its own, and a disposed
    // session must not throw on the way out.
    await new Promise<void>(resolve => {
      const child = spawn(
        this.options.sshBinary ?? 'ssh',
        ['-o', `ControlPath=${controlSocketPath(this.options)}`, '-O', 'exit', this.options.host],
        { shell: false, stdio: 'ignore' },
      );
      child.on('error', () => resolve());
      child.on('close', () => resolve());
    });
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
