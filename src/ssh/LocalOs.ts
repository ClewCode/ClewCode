/**
 * {@link RemoteOs} over this machine — plain `node:fs` and `node:child_process`.
 *
 * Exists so the local path and the ssh path are the *same* code path from a
 * caller's point of view: anything that works against LocalOs works against
 * SshOs, and local runs stay the fast default with no transport in the way.
 */
import { spawn } from 'child_process';
import { constants } from 'fs';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import type { ExecOptions, ExecResult, RemoteDirEntry, RemoteOs, RemoteStat } from './RemoteOs.js';
import { assertRemoteOs, RemoteOsError } from './RemoteOs.js';
import { resolveFor, type TargetPlatform } from './remotePath.js';

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

export class LocalOs implements RemoteOs {
  readonly name = 'local';
  readonly platform: TargetPlatform = process.platform === 'win32' ? 'win32' : 'posix';

  private currentCwd: string;

  constructor(cwd: string = process.cwd()) {
    this.currentCwd = cwd;
  }

  cwd(): string {
    return this.currentCwd;
  }

  async chdir(path: string): Promise<void> {
    const target = this.resolve(path);
    const info = await stat(target).catch(cause => {
      throw new RemoteOsError(`Cannot chdir to ${target}`, cause);
    });
    if (!info.isDirectory()) {
      throw new RemoteOsError(`Cannot chdir to ${target}: not a directory`);
    }
    // Only this instance moves — never process.chdir(), which would yank the
    // working directory out from under every other part of the process.
    this.currentCwd = target;
  }

  resolve(path: string): string {
    return resolveFor(this.platform, this.currentCwd, path);
  }

  async stat(path: string): Promise<RemoteStat> {
    const target = this.resolve(path);
    try {
      const info = await stat(target);
      return {
        size: info.size,
        isFile: info.isFile(),
        isDirectory: info.isDirectory(),
        isSymbolicLink: info.isSymbolicLink(),
        mtimeMs: info.mtimeMs,
        mode: info.mode,
      };
    } catch (cause) {
      throw new RemoteOsError(`Cannot stat ${target}`, cause);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(this.resolve(path), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(path: string): Promise<Buffer> {
    const target = this.resolve(path);
    try {
      return await readFile(target);
    } catch (cause) {
      throw new RemoteOsError(`Cannot read ${target}`, cause);
    }
  }

  async readText(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    return (await this.readFile(path)).toString(encoding);
  }

  async writeFile(path: string, data: Buffer | string): Promise<void> {
    const target = this.resolve(path);
    try {
      await writeFile(target, data);
    } catch (cause) {
      throw new RemoteOsError(`Cannot write ${target}`, cause);
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const target = this.resolve(path);
    try {
      await mkdir(target, { recursive: options?.recursive ?? false });
    } catch (cause) {
      throw new RemoteOsError(`Cannot create directory ${target}`, cause);
    }
  }

  async readdir(path: string): Promise<RemoteDirEntry[]> {
    const target = this.resolve(path);
    try {
      const entries = await readdir(target, { withFileTypes: true });
      return entries.map(entry => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      }));
    } catch (cause) {
      throw new RemoteOsError(`Cannot list ${target}`, cause);
    }
  }

  async exec(command: string, args: readonly string[], options?: ExecOptions): Promise<ExecResult> {
    const maxBuffer = options?.maxBuffer ?? DEFAULT_MAX_BUFFER;
    // spawn without `shell` — arguments reach the program verbatim, so shell
    // metacharacters in a filename or a search pattern cannot become syntax.
    const child = spawn(command, [...args], {
      cwd: options?.cwd ? this.resolve(options.cwd) : this.currentCwd,
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      shell: false,
    });
    return collectProcessOutput(child, maxBuffer, options);
  }

  async dispose(): Promise<void> {
    // Nothing to release: no transport, no long-lived handles.
  }
}

assertRemoteOs(LocalOs);

/**
 * Drain a child's streams into an {@link ExecResult}.
 *
 * Shared with SshOs, which spawns an `ssh` client the same way — the only
 * difference is which program is on the other end of the pipes.
 */
export async function collectProcessOutput(
  child: ReturnType<typeof spawn>,
  maxBuffer: number,
  options?: Pick<ExecOptions, 'signal' | 'timeoutMs'>,
): Promise<ExecResult> {
  let stdout = '';
  let stderr = '';
  let truncated = false;
  let aborted = false;

  const append = (current: string, chunk: Buffer): string => {
    if (current.length >= maxBuffer) {
      truncated = true;
      return current;
    }
    const next = current + chunk.toString('utf8');
    if (next.length > maxBuffer) {
      truncated = true;
      return next.slice(0, maxBuffer);
    }
    return next;
  };

  child.stdout?.on('data', (chunk: Buffer) => {
    stdout = append(stdout, chunk);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = append(stderr, chunk);
  });

  const kill = () => {
    aborted = true;
    child.kill('SIGKILL');
  };
  const timer = options?.timeoutMs ? setTimeout(kill, options.timeoutMs) : undefined;
  const onAbort = () => kill();
  options?.signal?.addEventListener('abort', onAbort, { once: true });
  if (options?.signal?.aborted) {
    kill();
  }

  try {
    return await new Promise<ExecResult>((resolve, reject) => {
      child.on('error', cause => {
        reject(new RemoteOsError(`Failed to run ${child.spawnfile}`, cause));
      });
      child.on('close', (exitCode, signal) => {
        resolve({
          stdout,
          stderr,
          exitCode,
          signal: signal ?? undefined,
          aborted,
          truncated,
        });
      });
    });
  } finally {
    if (timer) clearTimeout(timer);
    options?.signal?.removeEventListener('abort', onAbort);
  }
}
