/**
 * fd-find utility — fast file finding using the `fd` command.
 *
 * `fd` is a Rust-based alternative to `find` that is significantly faster
 * for recursive file listing. When available on the system PATH, GlobTool
 * uses `fd` instead of ripgrep's `--files` mode for better performance.
 *
 * Falls back gracefully to ripgrep when `fd` is not installed.
 *
 * See: https://github.com/sharkdp/fd
 */

import { execFile } from 'child_process';
import { statSync } from 'fs';
import { findExecutable } from './findExecutable.js';
import { logForDebugging } from './debug.js';

const MAX_BUFFER_SIZE = 20_000_000; // 20MB

let fdPath: string | null = null;
let fdChecked = false;

/**
 * Resolve the path to the `fd` executable on the system.
 * Returns null if `fd` is not found on PATH.
 * Caches the result after the first check.
 */
export function findFd(): string | null {
  if (fdChecked) return fdPath;
  fdChecked = true;

  try {
    const { cmd } = findExecutable('fd', []);
    // `which` returns the original name if not found, so verify it exists
    try {
      statSync(cmd);
      fdPath = cmd;
      logForDebugging(`[fd] found at ${cmd}`);
    } catch {
      fdPath = null;
    }
  } catch {
    fdPath = null;
  }

  return fdPath;
}

/**
 * List files matching a glob pattern using `fd`.
 *
 * @param pattern Glob pattern to match (e.g. all .ts files recursively)
 * @param cwd Directory to search in
 * @param hidden Include hidden files (default: true)
 * @param noIgnore Don't respect .gitignore (default: true)
 * @param excludePatterns Additional glob patterns to exclude (e.g. ["node_modules", "*.log"])
 * @param abortSignal Optional AbortSignal to cancel the operation
 * @returns Array of matching file paths (absolute)
 */
export function fdListFiles(
  pattern: string,
  cwd: string,
  hidden: boolean = true,
  noIgnore: boolean = true,
  excludePatterns: string[] = [],
  abortSignal?: AbortSignal,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const fd = findFd();
    if (!fd) {
      reject(new Error('fd not found on system PATH'));
      return;
    }

    const args: string[] = [
      '--type', 'f',          // Only files
      '--glob', pattern,      // Glob pattern
      '--absolute-path',      // Always output absolute paths
    ];

    if (hidden) args.push('--hidden');
    if (noIgnore) args.push('--no-ignore');

    // Add exclude patterns (fd uses --exclude, not --glob !pattern like rg)
    for (const excl of excludePatterns) {
      args.push('--exclude', excl);
    }

    // fd sorts by modified time with --sort option (newest first)
    // Using --sort=modified to match ripgrep --sort=modified behavior
    args.push('--sort', 'modified');

    execFile(
      fd,
      [...args, '--', cwd],
      {
        maxBuffer: MAX_BUFFER_SIZE,
        windowsHide: true,
        signal: abortSignal,
      },
      (error, stdout, _stderr) => {
        if (error) {
          // Exit code 1 = no matches found (not an error)
          if (error.code === 1) {
            resolve([]);
            return;
          }
          reject(error);
          return;
        }

        const results = stdout
          .trim()
          .split('\n')
          .map(line => line.replace(/\r$/, ''))
          .filter(Boolean);

        resolve(results);
      },
    );
  });
}

/**
 * Check if fd is available and log its version for diagnostics.
 */
export function getFdStatus(): { available: boolean; path: string | null } {
  return {
    available: findFd() !== null,
    path: fdPath,
  };
}
