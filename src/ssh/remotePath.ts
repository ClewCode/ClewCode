/**
 * Path handling for a *target* machine, which is not necessarily this one.
 *
 * The trap this exists to avoid: clew running on Windows builds `D:\repo\src`
 * with `node:path` and hands it to a Linux host, or joins a remote posix path
 * with backslashes. Path semantics must follow the machine the path belongs
 * to, so every operation here takes the target platform explicitly instead of
 * reading `process.platform`.
 */
import { posix as posixPath, win32 as win32Path } from 'path';

export type TargetPlatform = 'posix' | 'win32';

/** The `node:path` implementation for a target, never the ambient one. */
export function pathModuleFor(platform: TargetPlatform): typeof posixPath {
  return platform === 'win32' ? (win32Path as unknown as typeof posixPath) : posixPath;
}

/** Join segments using the target's separator. */
export function joinFor(platform: TargetPlatform, ...segments: string[]): string {
  return pathModuleFor(platform).join(...segments);
}

/** Normalize using the target's rules (collapses `..`, duplicate separators). */
export function normalizeFor(platform: TargetPlatform, path: string): string {
  return pathModuleFor(platform).normalize(path);
}

export function isAbsoluteFor(platform: TargetPlatform, path: string): boolean {
  return pathModuleFor(platform).isAbsolute(path);
}

/**
 * Resolve `path` against `cwd` on the target.
 *
 * Deliberately does not fall back to `process.cwd()` the way `path.resolve`
 * does: a relative remote path with no known remote cwd is a bug, not an
 * invitation to silently use the local working directory.
 */
export function resolveFor(platform: TargetPlatform, cwd: string, path: string): string {
  const p = pathModuleFor(platform);
  if (p.isAbsolute(path)) {
    return p.normalize(path);
  }
  if (!cwd) {
    throw new Error(`Cannot resolve relative path ${JSON.stringify(path)} without a target cwd`);
  }
  return p.normalize(p.join(cwd, path));
}

/**
 * True when `path` is inside `root` on the target.
 *
 * Both sides are normalized first, so `/repo/../etc/passwd` cannot masquerade
 * as being under `/repo`. A path equal to the root counts as inside.
 */
export function isInsideFor(platform: TargetPlatform, root: string, path: string): boolean {
  const p = pathModuleFor(platform);
  const normalizedRoot = p.normalize(root);
  const normalizedPath = p.normalize(path);
  if (normalizedPath === normalizedRoot) {
    return true;
  }
  const withSeparator = normalizedRoot.endsWith(p.sep) ? normalizedRoot : normalizedRoot + p.sep;
  return normalizedPath.startsWith(withSeparator);
}

/**
 * Quote one argument for a POSIX shell running on the target.
 *
 * Single-quote wrapping with the `'\''` escape is the only form that is safe
 * for every byte a filename can contain — no expansion, no word splitting, no
 * escape processing happens inside single quotes.
 */
export function shellQuotePosix(arg: string): string {
  return `'${arg.replaceAll("'", `'\\''`)}'`;
}

/** Quote a whole command line for a POSIX shell on the target. */
export function shellQuoteArgsPosix(args: readonly string[]): string {
  return args.map(shellQuotePosix).join(' ');
}

/**
 * Prefix a command with a `cd` into `cwd`.
 *
 * SSH has no per-connection working directory — every exec starts wherever the
 * remote login lands. The cwd has to be re-established on each command.
 *
 * Intentionally strict: `cd` failing aborts via `&&` rather than running the
 * command in the wrong directory. A remote build that silently ran in `$HOME`
 * instead of the repo is far worse than one that fails loudly.
 */
export function withRemoteCwd(cwd: string | undefined, command: string): string {
  if (!cwd) {
    return command;
  }
  return `cd ${shellQuotePosix(cwd)} && ${command}`;
}
