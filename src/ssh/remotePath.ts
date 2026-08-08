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
 * Quote a directory for `cd` while keeping `~` meaningful.
 *
 * Plain quoting breaks the tilde: `cd '~/repo'` looks for a directory literally
 * named `~`, because expansion does not happen inside single quotes. The home
 * prefix is therefore translated to `$HOME` — which the shell does expand
 * inside double quotes — and only the remainder is quoted.
 */
export function quoteCdTarget(cwd: string): string {
  if (cwd === '~') {
    return '$HOME';
  }
  if (cwd === '~/') {
    return '$HOME';
  }
  if (cwd.startsWith('~/')) {
    return `$HOME/${shellQuotePosix(cwd.slice(2))}`;
  }
  // `~user` is deliberately not handled: expanding it needs the remote's
  // passwd database, and quoting it as a literal is the safe reading.
  return shellQuotePosix(cwd);
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
  return `cd ${quoteCdTarget(cwd)} && ${command}`;
}

/** Marker wrapping the trailing `pwd`, unique per session so nested runs can't collide. */
export function cwdMarker(sessionId: string): string {
  return `__CLEW_CWD_${sessionId}__`;
}

/**
 * Wrap a command so the directory it *ends* in is reported back.
 *
 * Prefixing `cd` only re-establishes the directory we already knew about. It
 * cannot see a `cd` the command performs itself, so `cd build && make`
 * followed by `make install` would run the second command back in the original
 * directory — nothing like the shell session the model believes it has.
 *
 * The command therefore ends with a `pwd` fenced by a marker, which the caller
 * parses out of stdout and strips before the model ever sees it.
 *
 * `;` rather than `&&` joins the marker: the directory must be reported even
 * when the command fails, or one failing command would strand the session at a
 * stale directory.
 */
export function withCwdReport(sessionId: string, command: string): string {
  const marker = cwdMarker(sessionId);
  return `${command}\n__clew_status=$?\nprintf '\\n%s%s%s\\n' '${marker}' "$(pwd)" '${marker}'\nexit $__clew_status`;
}

export type CwdReport = {
  /** Output with the marker line removed. */
  output: string;
  /** Directory the command ended in, or undefined when no marker was found. */
  cwd?: string;
};

/**
 * Pull the trailing cwd marker out of command output.
 *
 * Scans from the end so a command that happens to echo an earlier marker
 * (replaying a log, for instance) cannot win over the one the wrapper wrote,
 * and the search for the opening marker is bounded — a path is not megabytes
 * long, and an unbounded reverse scan over huge output is wasted work.
 *
 * Output with no marker is returned untouched: a killed or timed-out command
 * never reaches the `printf`, and losing its output would be far worse than
 * losing the cwd update.
 */
export function extractCwdReport(sessionId: string, output: string): CwdReport {
  const marker = cwdMarker(sessionId);
  const closing = output.lastIndexOf(marker);
  if (closing === -1) {
    return { output };
  }
  const searchFrom = Math.max(0, closing - MAX_REPORTED_CWD_LENGTH);
  const opening = output.lastIndexOf(marker, closing - 1);
  if (opening === -1 || opening < searchFrom) {
    return { output };
  }

  const cwd = output.slice(opening + marker.length, closing).trim();
  // Drop the whole line, including the newline the wrapper injected before it,
  // so a command whose own output had no trailing newline is not left with a
  // spurious blank line.
  const lineStart = output.lastIndexOf('\n', opening);
  const afterClosing = output.indexOf('\n', closing + marker.length);
  const lineEnd = afterClosing === -1 ? output.length : afterClosing + 1;
  const cleaned = output.slice(0, lineStart === -1 ? opening : lineStart) + output.slice(lineEnd);

  return { output: cleaned, cwd: cwd || undefined };
}

/** A path is not megabytes long; bound the reverse scan for the opening marker. */
const MAX_REPORTED_CWD_LENGTH = 4096;
