/**
 * Repo Map Generator — builds structural AST map of codebase within strict token budget.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { RepoMapCacheStore } from './cache.js';
import { extractFileSymbols } from './extractor.js';
import { DEFAULT_REPOMAP_CONFIG, type FileSignatures, type RepoMapConfig } from './types.js';

export class RepoMapGenerator {
  private config: RepoMapConfig;
  private cacheStore: RepoMapCacheStore;

  constructor(config?: Partial<RepoMapConfig>, cacheStore?: RepoMapCacheStore) {
    this.config = { ...DEFAULT_REPOMAP_CONFIG, ...config };
    this.cacheStore = cacheStore ?? new RepoMapCacheStore();
  }

  generate(rootDir: string): { mapText: string; totalFiles: number; tokenEstimate: number } {
    if (!this.config.enabled) {
      return { mapText: '', totalFiles: 0, tokenEstimate: 0 };
    }

    const files = this.collectSourceFiles(rootDir);
    const cache = this.cacheStore.load();
    const updatedFilesCache: Record<string, FileSignatures> = {};
    let hasChanges = false;

    for (const file of files) {
      const relPath = relative(rootDir, file).replace(/\\/g, '/');
      try {
        const stat = statSync(file);
        const cached = cache.files[relPath];

        if (cached && cached.mtimeMs === stat.mtimeMs) {
          updatedFilesCache[relPath] = cached;
        } else {
          const content = readFileSync(file, 'utf8');
          const symbols = extractFileSymbols(content, relPath);
          const sigs: FileSignatures = {
            filePath: relPath,
            mtimeMs: stat.mtimeMs,
            symbols,
            tokenEstimate: Math.round(symbols.map(s => s.signature).join(' ').length / 4),
          };
          updatedFilesCache[relPath] = sigs;
          hasChanges = true;
        }
      } catch {
        // file unreadable or deleted
      }
    }

    if (hasChanges) {
      cache.files = updatedFilesCache;
      this.cacheStore.save(cache);
    }

    // Format output within token budget
    const maxChars = this.config.maxTokens * 4;
    const lines: string[] = ['<repo_map>', 'Codebase Architecture & Structural Signatures:'];

    const sortedFiles = Object.keys(updatedFilesCache)
      .filter(f => updatedFilesCache[f]!.symbols.length > 0)
      .sort((a, b) => a.localeCompare(b));

    let currentLength = lines.join('\n').length;
    let includedCount = 0;

    for (const relPath of sortedFiles) {
      const fileSig = updatedFilesCache[relPath]!;
      const fileHeader = `\n📄 ${relPath}:`;
      const symbolLines = fileSig.symbols
        .map(s => `  ${s.kind === 'interface' ? 'interface' : s.kind} ${s.name}: ${s.signature}`)
        .join('\n');

      const chunk = `${fileHeader}\n${symbolLines}`;
      if (currentLength + chunk.length > maxChars) {
        lines.push(`\n... (${sortedFiles.length - includedCount} more files omitted for brevity)`);
        break;
      }

      lines.push(chunk);
      currentLength += chunk.length;
      includedCount++;
    }

    lines.push('</repo_map>');
    const mapText = lines.join('\n');
    const tokenEstimate = Math.round(mapText.length / 4);

    return {
      mapText,
      totalFiles: includedCount,
      tokenEstimate,
    };
  }

  private collectSourceFiles(dir: string, depth = 0): string[] {
    if (depth > 6) return [];
    const results: string[] = [];

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = resolve(dir, entry.name);
        const name = entry.name;

        if (
          name.startsWith('.') ||
          name === 'node_modules' ||
          name === 'dist' ||
          name === 'build' ||
          name === '__tests__' ||
          name === 'coverage'
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          results.push(...this.collectSourceFiles(fullPath, depth + 1));
        } else if (entry.isFile()) {
          const ext = name.split('.').pop()?.toLowerCase();
          if (
            ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs'].includes(ext || '') &&
            !name.includes('.test.') &&
            !name.includes('.spec.')
          ) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // ignore
    }

    return results;
  }
}
