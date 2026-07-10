import { basename, dirname, isAbsolute, join, sep } from 'path';
import type { ToolPermissionContext } from '../Tool.js';
import { logForDebugging } from './debug.js';
import { isEnvTruthy } from './envUtils.js';
import { fdListFiles, findFd } from './fd.js';
import { getFileReadIgnorePatterns, normalizePatternsToPath } from './permissions/filesystem.js';
import { getPlatform } from './platform.js';
import { getGlobExclusionsForPluginCache } from './plugins/orphanedPluginFilter.js';
import { ripGrep } from './ripgrep.js';

/**
 * Extracts the static base directory from a glob pattern.
 * The base directory is everything before the first glob special character (* ? [ {).
 * Returns the directory portion and the remaining relative pattern.
 */
export function extractGlobBaseDirectory(pattern: string): {
  baseDir: string;
  relativePattern: string;
} {
  // Find the first glob special character: *, ?, [, {
  const globChars = /[*?[{]/;
  const match = pattern.match(globChars);

  if (!match || match.index === undefined) {
    // No glob characters - this is a literal path
    // Return the directory portion and filename as pattern
    const dir = dirname(pattern);
    const file = basename(pattern);
    return { baseDir: dir, relativePattern: file };
  }

  // Get everything before the first glob character
  const staticPrefix = pattern.slice(0, match.index);

  // Find the last path separator in the static prefix
  const lastSepIndex = Math.max(staticPrefix.lastIndexOf('/'), staticPrefix.lastIndexOf(sep));

  if (lastSepIndex === -1) {
    // No path separator before the glob - pattern is relative to cwd
    return { baseDir: '', relativePattern: pattern };
  }

  let baseDir = staticPrefix.slice(0, lastSepIndex);
  const relativePattern = pattern.slice(lastSepIndex + 1);

  // Handle root directory patterns (e.g., /*.txt on Unix or C:/*.txt on Windows)
  // When lastSepIndex is 0, baseDir is empty but we need to use '/' as the root
  if (baseDir === '' && lastSepIndex === 0) {
    baseDir = '/';
  }

  // Handle Windows drive root paths (e.g., C:/*.txt)
  // 'C:' means "current directory on drive C" (relative), not root
  // We need 'C:/' or 'C:\' for the actual drive root
  if (getPlatform() === 'windows' && /^[A-Za-z]:$/.test(baseDir)) {
    baseDir = baseDir + sep;
  }

  return { baseDir, relativePattern };
}

export async function glob(
  filePattern: string,
  cwd: string,
  { limit, offset }: { limit: number; offset: number },
  abortSignal: AbortSignal,
  toolPermissionContext: ToolPermissionContext,
): Promise<{ files: string[]; truncated: boolean }> {
  let searchDir = cwd;
  let searchPattern = filePattern;

  // Handle absolute paths by extracting the base directory and converting to relative pattern
  // ripgrep's --glob flag only works with relative patterns
  if (isAbsolute(filePattern)) {
    const { baseDir, relativePattern } = extractGlobBaseDirectory(filePattern);
    if (baseDir) {
      searchDir = baseDir;
      searchPattern = relativePattern;
    }
  }

  const ignorePatterns = normalizePatternsToPath(getFileReadIgnorePatterns(toolPermissionContext), searchDir);

  // Try fd first if available (significantly faster for pure file listing)
  // Use || instead of ?? to treat empty string as unset (defaulting to true)
  const noIgnore = isEnvTruthy(process.env.CLEW_CODE_GLOB_NO_IGNORE || 'true');
  const hidden = isEnvTruthy(process.env.CLEW_CODE_GLOB_HIDDEN || 'true');

  const fdAvailable = findFd() !== null;
  let allPaths: string[] = [];
  let usedFd = false;

  if (fdAvailable) {
    // Collect exclude patterns from permissions and plugin cache
    const excludePatterns: string[] = [...ignorePatterns];

    // Exclude orphaned plugin version directories
    for (const exclusion of await getGlobExclusionsForPluginCache(searchDir)) {
      // Convert rg exclusion format (!pattern or pattern) to fd --exclude format
      // fd uses --exclude which is always an exclusion pattern
      const clean = exclusion.startsWith('!') ? exclusion.slice(1) : exclusion;
      excludePatterns.push(clean);
    }

    try {
      allPaths = await fdListFiles(searchPattern, searchDir, hidden, noIgnore, excludePatterns, abortSignal);
      // fdListFiles already returns absolute paths with --absolute-path
      usedFd = true;
      logForDebugging(`[fd] glob completed using fd (${allPaths.length} files)`);
    } catch (err) {
      // fd failed — fall back to ripgrep
      logForDebugging(`[fd] fd failed, falling back to ripgrep: ${(err as Error).message}`);
      usedFd = false;
    }
  }

  if (!usedFd) {
    // Fall back to ripgrep
    // --files: list files instead of searching content
    // --glob: filter by pattern
    // --sort=modified: sort by modification time (oldest first)
    // --no-ignore: don't respect .gitignore (default true)
    // --hidden: include hidden files (default true)
    const args = [
      '--files',
      '--glob',
      searchPattern,
      '--sort=modified',
      ...(noIgnore ? ['--no-ignore'] : []),
      ...(hidden ? ['--hidden'] : []),
    ];

    // Add ignore patterns
    for (const pattern of ignorePatterns) {
      args.push('--glob', `!${pattern}`);
    }

    // Exclude orphaned plugin version directories
    for (const exclusion of await getGlobExclusionsForPluginCache(searchDir)) {
      args.push('--glob', exclusion);
    }

    const rgPaths = await ripGrep(args, searchDir, abortSignal);

    // ripgrep returns relative paths, convert to absolute
    allPaths = rgPaths.map(p => (isAbsolute(p) ? p : join(searchDir, p)));
  }

  const truncated = allPaths.length > offset + limit;
  const files = allPaths.slice(offset, offset + limit);

  return { files, truncated };
}
