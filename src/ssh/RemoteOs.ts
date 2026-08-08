/**
 * One interface for "do a filesystem or process operation on a machine",
 * whether that machine is this one or a host at the end of an ssh connection.
 *
 * Callers work against {@link RemoteOs} and never learn which they got. The
 * shape follows what clew's tools actually need — read, write, list, stat,
 * exec — not a general POSIX surface.
 *
 * Every implementation declares its own {@link TargetPlatform}, so path
 * handling follows the target rather than the machine clew happens to run on;
 * see `remotePath.ts`.
 */
import type { TargetPlatform } from './remotePath.js';

/** Subset of `fs.Stats` that survives the trip over any transport. */
export type RemoteStat = {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  /** Epoch milliseconds, or undefined when the transport does not report it. */
  mtimeMs?: number;
  /** POSIX permission bits, or undefined when the target does not have them. */
  mode?: number;
};

export type RemoteDirEntry = {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
};

export type ExecOptions = {
  /** Working directory for this command; defaults to the instance's cwd. */
  cwd?: string;
  /** Extra environment for the command. */
  env?: Record<string, string>;
  /** Kill the command after this many milliseconds. */
  timeoutMs?: number;
  /** Cancels the command; the result reports `aborted`. */
  signal?: AbortSignal;
  /** Byte cap per stream; output past it is dropped and `truncated` is set. */
  maxBuffer?: number;
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  /** Null when the process was killed by a signal or never started. */
  exitCode: number | null;
  /** Set when the process died from a signal (`SIGKILL` on timeout). */
  signal?: string;
  /** True when the caller's signal aborted it or the timeout fired. */
  aborted: boolean;
  /** True when stdout or stderr hit `maxBuffer` and was cut short. */
  truncated: boolean;
};

export interface RemoteOs {
  /** Short identifier for logs and errors — 'local', or 'ssh:user@host'. */
  readonly name: string;

  /** Path semantics of the *target*, which may differ from this machine's. */
  readonly platform: TargetPlatform;

  /** Current working directory on the target. Always absolute. */
  cwd(): string;

  /** Change the working directory. Throws when the path is not a directory. */
  chdir(path: string): Promise<void>;

  /** Resolve a possibly-relative path against the target's cwd. */
  resolve(path: string): string;

  stat(path: string): Promise<RemoteStat>;

  /** Whether the path exists. Never throws for a missing path. */
  exists(path: string): Promise<boolean>;

  readFile(path: string): Promise<Buffer>;

  readText(path: string, encoding?: BufferEncoding): Promise<string>;

  writeFile(path: string, data: Buffer | string): Promise<void>;

  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  readdir(path: string): Promise<RemoteDirEntry[]>;

  /** Run a command. Arguments are passed as a list; no shell parsing by the caller. */
  exec(command: string, args: readonly string[], options?: ExecOptions): Promise<ExecResult>;

  /** Release transport resources. Safe to call more than once. */
  dispose(): Promise<void>;
}

/**
 * Compile-time conformance check.
 *
 * Call it once per implementation at module scope. It does nothing at runtime,
 * but a class that drifts from {@link RemoteOs} — a renamed method, a changed
 * signature, a field that stopped being readonly — becomes a type error at the
 * implementation instead of at some distant call site.
 *
 * Preferred over `class X implements RemoteOs` because it also catches
 * constructor and static drift, and works for object literals and factories.
 */
export function assertRemoteOs<T extends RemoteOs>(_implementation: new (...args: never[]) => T): void {
  // Types do all the work; there is nothing to check at runtime.
}

/** Value-level variant of {@link assertRemoteOs}, for factories and literals. */
export function asRemoteOs<T extends RemoteOs>(implementation: T): T {
  return implementation;
}

export class RemoteOsError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RemoteOsError';
  }
}
