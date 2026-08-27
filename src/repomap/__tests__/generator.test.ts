import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepoMapCacheStore } from '../cache.js';
import { RepoMapGenerator } from '../generator.js';

describe('Repo Map Generator', () => {
  let tempDir: string;
  let cacheStore: RepoMapCacheStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clew-repomap-test-'));
    cacheStore = new RepoMapCacheStore(join(tempDir, 'repomap-cache.json'));

    // Create dummy files
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(
      join(tempDir, 'src', 'auth.ts'),
      `
export interface AuthSession {
  token: string;
}
export function authenticate(): boolean {
  return true;
}
`,
    );

    writeFileSync(
      join(tempDir, 'src', 'db.ts'),
      `
export interface DatabaseClient {
  connect(): Promise<void>;
}
`,
    );
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('generates a formatted XML repo map with signatures', () => {
    const generator = new RepoMapGenerator({ maxTokens: 1000 }, cacheStore);
    const { mapText, totalFiles, tokenEstimate } = generator.generate(tempDir);

    expect(totalFiles).toBe(2);
    expect(tokenEstimate).toBeGreaterThan(0);
    expect(mapText).toContain('<repo_map>');
    expect(mapText).toContain('auth.ts');
    expect(mapText).toContain('interface AuthSession');
    expect(mapText).toContain('db.ts');
    expect(mapText).toContain('interface DatabaseClient');
    expect(mapText).toContain('</repo_map>');
  });

  it('respects token budget constraints', () => {
    // Set a tiny token budget
    const generator = new RepoMapGenerator({ maxTokens: 40 }, cacheStore);
    const { mapText, totalFiles } = generator.generate(tempDir);

    expect(totalFiles).toBeLessThanOrEqual(2);
    expect(mapText.length).toBeLessThanOrEqual(40 * 4 + 150);
  });
});
