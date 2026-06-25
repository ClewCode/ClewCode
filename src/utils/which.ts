import spawn from 'nano-spawn';
import { execSync_DEPRECATED } from './execSyncWrapper.js';

/**
 * Short-lived cache for missing executables to avoid repeated synchronous
 * `where.exe` / `which` spawns on every check. Only caches MISS results
 * (null); found results are path-dependent and shouldn't expire this way.
 *
 * TTL: 30 seconds — long enough to prevent event-loop stalls from repeated
 * checks in a single operation, but short enough that a newly installed
 * executable is picked up soon after.
 */
const missingCache = new Map<string, number>();
const MISSING_TTL_MS = 30_000;

function isMissingCached(command: string): boolean {
  const expiry = missingCache.get(command);
  if (expiry && Date.now() < expiry) return true;
  missingCache.delete(command);
  return false;
}

function setMissingCache(command: string): void {
  missingCache.set(command, Date.now() + MISSING_TTL_MS);
}

async function whichNodeAsync(command: string): Promise<string | null> {
  if (isMissingCached(command)) return null;

  if (process.platform === 'win32') {
    // On Windows, use where.exe and return the first result
    let stdout = '';
    let exitCode = 0;
    try {
      const result = await spawn(`where.exe ${command}`, {
        shell: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      stdout = result.stdout;
    } catch (e) {
      exitCode = e.exitCode ?? 1;
      stdout = e.stdout ?? '';
    }
    if (exitCode !== 0 || !stdout) {
      setMissingCache(command);
      return null;
    }
    // where.exe returns multiple paths separated by newlines, return the first
    return stdout.trim().split(/\r?\n/)[0] || null;
  }

  // On POSIX systems (macOS, Linux, WSL), use which
  // Cross-platform safe: Windows is handled above
  // eslint-disable-next-line custom-rules/no-cross-platform-process-issues
  let stdout = '';
  let exitCode = 0;
  try {
    const result = await spawn(`which ${command}`, {
      shell: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    stdout = result.stdout;
  } catch (e) {
    exitCode = e.exitCode ?? 1;
    stdout = e.stdout ?? '';
  }
  if (exitCode !== 0 || !stdout) {
    setMissingCache(command);
    return null;
  }
  return result.stdout.trim();
}

function whichNodeSync(command: string): string | null {
  if (isMissingCached(command)) return null;

  if (process.platform === 'win32') {
    try {
      const result = execSync_DEPRECATED(`where.exe ${command}`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const output = result.toString().trim();
      if (!output) {
        setMissingCache(command);
        return null;
      }
      return output.split(/\r?\n/)[0] || null;
    } catch {
      setMissingCache(command);
      return null;
    }
  }

  try {
    const result = execSync_DEPRECATED(`which ${command}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const output = result.toString().trim();
    if (!output) {
      setMissingCache(command);
      return null;
    }
    return output || null;
  } catch {
    setMissingCache(command);
    return null;
  }
}

const bunWhich = typeof Bun !== 'undefined' && typeof Bun.which === 'function' ? Bun.which : null;

/**
 * Finds the full path to a command executable.
 * Uses Bun.which when running in Bun (fast, no process spawn),
 * otherwise spawns the platform-appropriate command.
 *
 * Missing results are cached for 30 seconds to avoid repeated
 * process spawns (especially synchronous `where.exe` on Windows
 * which can stall the event loop).
 *
 * @param command - The command name to look up
 * @returns The full path to the command, or null if not found
 */
export const which: (command: string) => Promise<string | null> = bunWhich
  ? async command => {
      if (isMissingCached(command)) return null;
      const result = bunWhich(command);
      if (!result) setMissingCache(command);
      return result;
    }
  : whichNodeAsync;

/**
 * Synchronous version of `which`.
 *
 * Missing results are cached for 30 seconds to avoid blocking
 * the event loop with repeated synchronous `where.exe` spawns
 * on Windows.
 *
 * @param command - The command name to look up
 * @returns The full path to the command, or null if not found
 */
export const whichSync: (command: string) => string | null = bunWhich
  ? (command: string) => {
      if (isMissingCached(command)) return null;
      const result = bunWhich(command);
      if (!result) setMissingCache(command);
      return result;
    }
  : whichNodeSync;
