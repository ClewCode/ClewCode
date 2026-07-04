import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { DOT_CLEW } from '../clewPaths.js';
import { expandPath } from '../path.js';

/**
 * Cross-repo workspace linking.
 *
 * Each repo can declare which other project directories it works together with.
 * The pairing is stored in `<repo>/.clew/workspace.json` and is *bidirectional*:
 * linking A→B writes the link into both A's and B's workspace file, so returning
 * to either project surfaces the whole group without re-entering paths.
 */

export const WORKSPACE_FILE_VERSION = 1;

export type WorkspaceFile = {
  version: number;
  /** Absolute paths of linked project roots. */
  links: string[];
};

function workspaceFilePath(repoDir: string): string {
  return join(repoDir, DOT_CLEW, 'workspace.json');
}

/** Normalize a user-supplied path to an absolute, separator-stable key. */
export function normalizeRepoDir(input: string): string {
  return resolve(expandPath(input));
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Read a repo's workspace file, or null if it has none / is unreadable. */
export function readWorkspaceFile(repoDir: string): WorkspaceFile | null {
  const filePath = workspaceFilePath(repoDir);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<WorkspaceFile>;
    const links = Array.isArray(parsed.links) ? parsed.links.filter((l): l is string => typeof l === 'string') : [];
    return {
      version: typeof parsed.version === 'number' ? parsed.version : WORKSPACE_FILE_VERSION,
      links: dedupeDirs(links.map(normalizeRepoDir)),
    };
  } catch {
    return null;
  }
}

function dedupeDirs(dirs: string[]): string[] {
  return Array.from(new Set(dirs));
}

/** Overwrite a repo's link list (creates `.clew/` if missing). */
export function writeWorkspaceLinks(repoDir: string, links: string[]): void {
  const filePath = workspaceFilePath(repoDir);
  mkdirSync(dirname(filePath), { recursive: true });
  const payload: WorkspaceFile = {
    version: WORKSPACE_FILE_VERSION,
    links: dedupeDirs(links.map(normalizeRepoDir)),
  };
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/** The linked project roots declared by `repoDir` (absolute, normalized). */
export function getDeclaredLinks(repoDir: string): string[] {
  return readWorkspaceFile(repoDir)?.links ?? [];
}

/**
 * The linked project roots that currently exist on disk. `repoDir` itself is
 * always filtered out so a self-link never becomes a working directory.
 */
export function getLinkedDirs(repoDir: string): string[] {
  const self = normalizeRepoDir(repoDir);
  return getDeclaredLinks(repoDir).filter(dir => dir !== self && isDirectory(dir));
}

export type LinkResult =
  | { ok: true; target: string; alreadyLinked: boolean }
  | { ok: false; reason: 'self' | 'notFound' | 'notDirectory'; target: string };

/**
 * Link `currentDir` and `targetDir` together (bidirectional). Writes the link
 * into both repos' workspace files. Returns a discriminated result the caller
 * renders.
 */
export function linkProjects(currentDir: string, targetDirInput: string): LinkResult {
  const current = normalizeRepoDir(currentDir);
  const target = normalizeRepoDir(targetDirInput);

  if (current === target) {
    return { ok: false, reason: 'self', target };
  }
  if (!existsSync(target)) {
    return { ok: false, reason: 'notFound', target };
  }
  if (!isDirectory(target)) {
    return { ok: false, reason: 'notDirectory', target };
  }

  const currentLinks = getDeclaredLinks(current);
  const alreadyLinked = currentLinks.includes(target);

  writeWorkspaceLinks(current, dedupeDirs([...currentLinks, target]));
  // Mirror the link into the target so it surfaces from either side.
  writeWorkspaceLinks(target, dedupeDirs([...getDeclaredLinks(target), current]));

  return { ok: true, target, alreadyLinked };
}

/**
 * Remove the link between `currentDir` and `targetDir` from both repos.
 * Returns whether a link actually existed.
 */
export function unlinkProjects(currentDir: string, targetDirInput: string): { target: string; wasLinked: boolean } {
  const current = normalizeRepoDir(currentDir);
  const target = normalizeRepoDir(targetDirInput);

  const currentLinks = getDeclaredLinks(current);
  const wasLinked = currentLinks.includes(target);

  if (wasLinked) {
    writeWorkspaceLinks(
      current,
      currentLinks.filter(dir => dir !== target),
    );
  }
  // Always clean the reverse side too, in case the two files drifted.
  const targetLinks = getDeclaredLinks(target);
  if (targetLinks.includes(current)) {
    writeWorkspaceLinks(
      target,
      targetLinks.filter(dir => dir !== current),
    );
  }

  return { target, wasLinked };
}
