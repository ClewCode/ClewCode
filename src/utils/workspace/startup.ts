import {
  getAdditionalDirectoriesForClaudeMd,
  getOriginalCwd,
  setAdditionalDirectoriesForClaudeMd,
} from '../../bootstrap/state.js';
import { getCurrentProjectConfig, saveCurrentProjectConfig } from '../config.js';
import { getLinkedDirs } from './workspace.js';

/**
 * Linked project roots that should be offered for loading at startup: declared
 * in `.clew/workspace.json`, present on disk, not already a working directory,
 * and not previously declined by the user for this project.
 */
export function computePendingWorkspaceLinks(workingDirs: Set<string>): string[] {
  const links = getLinkedDirs(getOriginalCwd());
  if (links.length === 0) {
    return [];
  }
  const declined = new Set(getCurrentProjectConfig().workspaceLinksDeclined ?? []);
  return links.filter(dir => !workingDirs.has(dir) && !declined.has(dir));
}

/**
 * Persist the side effects of approving linked dirs (config + CLAUDE.md dir
 * list). The live permission-context update and permission persistence are
 * handled by the caller so tools see the change immediately.
 */
export function recordWorkspaceApproval(links: string[]): void {
  const current = getAdditionalDirectoriesForClaudeMd();
  const merged = Array.from(new Set([...current, ...links]));
  setAdditionalDirectoriesForClaudeMd(merged);

  saveCurrentProjectConfig(config => {
    const approved = new Set([...(config.workspaceLinksApproved ?? []), ...links]);
    const declined = (config.workspaceLinksDeclined ?? []).filter(dir => !links.includes(dir));
    return {
      ...config,
      workspaceLinksApproved: Array.from(approved),
      workspaceLinksDeclined: declined,
    };
  });
}

/** Remember that the user declined these links so we don't re-prompt. */
export function recordWorkspaceDecline(links: string[]): void {
  saveCurrentProjectConfig(config => {
    const declined = new Set([...(config.workspaceLinksDeclined ?? []), ...links]);
    return { ...config, workspaceLinksDeclined: Array.from(declined) };
  });
}
