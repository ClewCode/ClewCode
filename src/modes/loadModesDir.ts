/**
 * Loads user-defined modes from `.clew/modes/*.md` (project, walked up from
 * cwd) and `~/.clew/modes/*.md` (user). Mirrors how output styles are loaded
 * so the two feel the same to anyone who has written one before.
 *
 * The filename is the mode name unless frontmatter overrides it; the body is
 * the prompt.
 *
 *   ---
 *   name: gamemaster
 *   description: Runs a tabletop scene and tracks state
 *   ---
 *   You narrate a scene ...
 */
import memoize from 'lodash-es/memoize.js';
import { basename } from 'path';
import { getCwd } from '../utils/cwd.js';
import { coerceDescriptionToString } from '../utils/frontmatterParser.js';
import { logError } from '../utils/log.js';
import { extractDescriptionFromMarkdown, loadMarkdownFilesForSubdir } from '../utils/markdownConfigLoader.js';
import type { ModeConfig, ModeSource } from './modes.js';

const loadFromDisk = memoize(async (cwd: string): Promise<ModeConfig[]> => {
  try {
    const markdownFiles = await loadMarkdownFilesForSubdir('modes', cwd);

    return markdownFiles
      .map(({ filePath, frontmatter, content, source }) => {
        try {
          const fileName = basename(filePath).replace(/\.md$/, '');
          const name = String(frontmatter['name'] || fileName).toLowerCase();
          const prompt = content.trim();
          // A mode with no body would silently do nothing — surface it as
          // "not a mode" rather than shipping an empty system prompt section.
          if (!prompt) return null;

          return {
            name,
            description:
              coerceDescriptionToString(frontmatter['description'], fileName) ??
              extractDescriptionFromMarkdown(content, `Custom ${fileName} mode`),
            prompt,
            source: (source === 'projectSettings' ? 'project' : 'user') as ModeSource,
          } satisfies ModeConfig;
        } catch (error) {
          logError(error);
          return null;
        }
      })
      .filter((mode): mode is ModeConfig => mode !== null);
  } catch (error) {
    logError(error);
    return [];
  }
});

export async function getModeDirModes(): Promise<ModeConfig[]> {
  return loadFromDisk(getCwd());
}

/** Drop the disk cache so a newly written mode file is picked up. */
export function clearModeDirCache(): void {
  loadFromDisk.cache.clear?.();
}
