/**
 * Incremental mtime cache for Repo Map signatures.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { getCwd } from '../utils/cwd.js';
import type { RepoMapCache } from './types.js';

const CACHE_VERSION = 1;

export class RepoMapCacheStore {
  private customCachePath?: string;

  constructor(customPath?: string) {
    this.customCachePath = customPath;
  }

  private getCachePath(): string {
    if (this.customCachePath) return this.customCachePath;
    let root = process.cwd();
    try {
      root = getCwd();
    } catch {
      // ignore
    }
    return join(root, DOT_CLEW, 'cache', 'repomap.json');
  }

  load(): RepoMapCache {
    const cachePath = this.getCachePath();
    if (!existsSync(cachePath)) {
      return {
        version: CACHE_VERSION,
        lastUpdated: new Date().toISOString(),
        files: {},
      };
    }

    try {
      const raw = readFileSync(cachePath, 'utf8');
      const data = JSON.parse(raw) as RepoMapCache;
      if (data.version !== CACHE_VERSION) {
        return {
          version: CACHE_VERSION,
          lastUpdated: new Date().toISOString(),
          files: {},
        };
      }
      return data;
    } catch {
      return {
        version: CACHE_VERSION,
        lastUpdated: new Date().toISOString(),
        files: {},
      };
    }
  }

  save(cache: RepoMapCache): void {
    const cachePath = this.getCachePath();
    const dir = dirname(cachePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    cache.lastUpdated = new Date().toISOString();
    writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  }

  clear(): void {
    const cachePath = this.getCachePath();
    if (existsSync(cachePath)) {
      writeFileSync(
        cachePath,
        JSON.stringify({ version: CACHE_VERSION, lastUpdated: new Date().toISOString(), files: {} }, null, 2),
        'utf8',
      );
    }
  }
}
