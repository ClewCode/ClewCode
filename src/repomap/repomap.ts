/**
 * Repo Map loader and singleton helper.
 */

import { getCwd } from '../utils/cwd.js';
import { RepoMapCacheStore } from './cache.js';
import { RepoMapGenerator } from './generator.js';

let defaultGenerator: RepoMapGenerator | null = null;

export function getRepoMapGenerator(): RepoMapGenerator {
  if (!defaultGenerator) {
    defaultGenerator = new RepoMapGenerator();
  }
  return defaultGenerator;
}

export function loadRepoMapPrompt(): string | null {
  try {
    const root = getCwd();
    const generator = getRepoMapGenerator();
    const { mapText } = generator.generate(root);
    return mapText.length > 50 ? mapText : null;
  } catch {
    return null;
  }
}

export function clearRepoMapCache(): void {
  const store = new RepoMapCacheStore();
  store.clear();
}
