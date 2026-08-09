/**
 * Shared helpers for turning LSP location payloads into filesystem paths and
 * dropping the ones the user does not care about.
 *
 * Extracted from LSPTool.ts so `explore` can reuse the exact same gitignore and
 * URI handling as the single-shot operations — a symbol that findReferences
 * hides must not reappear in an explore bundle.
 */
import type { Location, LocationLink } from 'vscode-languageserver-types';
import { uniq } from '../../utils/array.js';
import { execFileNoThrowWithCwd } from '../../utils/execFileNoThrow.js';

/**
 * Extracts a file path from a file:// URI, decoding percent-encoded characters.
 */
export function uriToFilePath(uri: string): string {
  let filePath = uri.replace(/^file:\/\//, '');
  // On Windows, file:///C:/path becomes /C:/path — strip the leading slash
  if (/^\/[A-Za-z]:/.test(filePath)) {
    filePath = filePath.slice(1);
  }
  try {
    filePath = decodeURIComponent(filePath);
  } catch {
    // Use un-decoded path if malformed
  }
  return filePath;
}

/**
 * Checks if item is LocationLink (has targetUri) vs Location (has uri)
 */
export function isLocationLink(item: Location | LocationLink): item is LocationLink {
  return 'targetUri' in item;
}

/**
 * Converts LocationLink to Location format for uniform handling
 */
export function toLocation(item: Location | LocationLink): Location {
  if (isLocationLink(item)) {
    return {
      uri: item.targetUri,
      range: item.targetSelectionRange || item.targetRange,
    };
  }
  return item;
}

/**
 * Filters out locations whose file paths are gitignored.
 * Uses `git check-ignore` with batched path arguments for efficiency.
 */
export async function filterGitIgnoredLocations<T extends Location>(locations: T[], cwd: string): Promise<T[]> {
  if (locations.length === 0) {
    return locations;
  }

  // Collect unique file paths from URIs
  const uriToPath = new Map<string, string>();
  for (const loc of locations) {
    if (loc.uri && !uriToPath.has(loc.uri)) {
      uriToPath.set(loc.uri, uriToFilePath(loc.uri));
    }
  }

  const uniquePaths = uniq(uriToPath.values());
  if (uniquePaths.length === 0) {
    return locations;
  }

  // Batch check paths with git check-ignore
  // Exit code 0 = at least one path is ignored, 1 = none ignored, 128 = not a git repo
  const ignoredPaths = new Set<string>();
  const BATCH_SIZE = 50;
  for (let i = 0; i < uniquePaths.length; i += BATCH_SIZE) {
    const batch = uniquePaths.slice(i, i + BATCH_SIZE);
    const result = await execFileNoThrowWithCwd('git', ['check-ignore', ...batch], {
      cwd,
      preserveOutputOnError: false,
      timeout: 5_000,
    });

    if (result.code === 0 && result.stdout) {
      for (const line of result.stdout.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) {
          ignoredPaths.add(trimmed);
        }
      }
    }
  }

  if (ignoredPaths.size === 0) {
    return locations;
  }

  return locations.filter(loc => {
    const filePath = uriToPath.get(loc.uri);
    return !filePath || !ignoredPaths.has(filePath);
  });
}
