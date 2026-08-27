/**
 * Hybrid Code Search — orchestration.
 *
 * Cursor-style retrieval over the current workspace:
 *   - Chunking reuses the Repo Map symbol extractor (function/class granularity)
 *   - Embeddings reuse the memory system's model (@xenova granite-embedding)
 *   - Storage: FTS5 (BM25) + sqlite-vec (KNN), fused with Reciprocal Rank Fusion
 *
 * The index is synced incrementally on every query (mtime-based, cheap no-op
 * when nothing changed), same self-healing pattern as memdir/semanticSearch.
 */

import { readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { createEmbedding } from '../../memdir/semanticSearch.js';
import { extractFileSymbols } from '../../repomap/extractor.js';
import { getCwd } from '../../utils/cwd.js';
import { logForDebugging } from '../../utils/debug.js';
import {
  type CodeChunkRow,
  chunkNeedsUpdate,
  fuseRRF,
  getChunksByIds,
  pruneFileChunks,
  removeMissingFiles,
  searchFtsLeg,
  searchVectorLeg,
  storeChunk,
  toFtsQuery,
} from './db.js';

const VECTOR_TOP_K = 20;
const FTS_TOP_K = 30;
const FINAL_TOP_K = 8;
const VECTOR_THRESHOLD = 0.45; // loose — fusion does the real filtering
const SYNC_DEBOUNCE_MS = 60_000;

let _lastSyncAt = 0;
let _syncing: Promise<{ indexed: number; removed: number }> | null = null;

// Reuse the Repo Map's file walker (collectSourceFiles logic).
async function collectFiles(): Promise<Map<string, string>> {
  const root = getCwd();
  const files = new Map<string, string>(); // relPath -> absPath

  const walk = (dir: string, depth: number): void => {
    if (depth > 6) return;
    let entries;
    try {
      entries = require('node:fs').readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', '__tests__', 'coverage'].includes(entry.name))
        continue;
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (
          ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs'].includes(ext || '') &&
          !entry.name.includes('.test.') &&
          !entry.name.includes('.spec.')
        ) {
          files.set(relative(root, fullPath).replace(/\\/g, '/'), fullPath);
        }
      }
    }
  };

  walk(root, 0);
  return files;
}

/** mtime cache so unchanged files skip parse+embed entirely. */
const mtimeCache = new Map<string, number>();

/**
 * Sync the chunk index with the workspace. Incremental: only parses and
 * embeds new/changed files (mtime vs cached). Debounced to at most once
 * per minute within a session.
 */
export async function syncCodeIndex(force = false): Promise<{ indexed: number; removed: number }> {
  const now = Date.now();
  if (!force && now - _lastSyncAt < SYNC_DEBOUNCE_MS) return { indexed: 0, removed: 0 };
  if (_syncing) return _syncing.then(() => ({ indexed: 0, removed: 0 }));

  _syncing = (async () => {
    try {
      const files = await collectFiles();
      let indexed = 0;
      let removedCount = 0;
      let embedFailures = 0;
      let embedBroken = false;

      // Drop chunks whose files vanished.
      removedCount += removeMissingFiles(new Set(files.keys()));

      for (const [relPath, absPath] of files) {
        let stat;
        try {
          stat = statSync(absPath);
        } catch {
          continue;
        }
        const cachedMtime = mtimeCache.get(relPath);
        if (!force && cachedMtime === stat.mtimeMs) continue;

        try {
          const content = readFileSync(absPath, 'utf8');
          const symbols = extractFileSymbols(content, relPath);
          const keepKeys = new Set<string>();

          for (const sym of symbols) {
            const text = `${relPath}\n${sym.name} ${sym.kind} ${sym.signature}`;
            const textHash = hashText(text);
            keepKeys.add(`${relPath}:${sym.line}:${sym.name}`);
            if (!force && !chunkNeedsUpdate(relPath, sym, textHash)) continue;
            let embedding: number[] | null = null;
            if (!embedBroken) {
              try {
                embedding = await createEmbedding(text);
              } catch {
                embedFailures++;
                // ponytail: circuit breaker — model down means per-symbol network timeouts.
                // After 3 failures skip embeddings for the rest of this sync (FTS still works).
                if (embedFailures >= 3) {
                  embedBroken = true;
                  logForDebugging('[codeSearch] embedding model unavailable — continuing FTS-only', {
                    level: 'debug',
                  });
                }
              }
            }
            storeChunk(relPath, sym, textHash, embedding);
            indexed++;
          }
          pruneFileChunks(relPath, keepKeys);
          mtimeCache.set(relPath, stat.mtimeMs);
        } catch {
          // unreadable file — leave whatever is indexed stale rather than crash
        }
      }

      _lastSyncAt = Date.now();
      logForDebugging(`[codeSearch] sync complete: ${indexed} chunks indexed, ${removedCount} files removed`, {
        level: 'debug',
      });
      return { indexed, removed: removedCount };
    } finally {
      _syncing = null;
    }
  })();

  return _syncing;
}

function hashText(text: string): string {
  // Cheap djb2 — avoids importing crypto just for change detection.
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export interface HybridSearchResult extends CodeChunkRow {
  score: number; // fused RRF score
  vectorScore: number | null;
  ftsScore: number | null;
}

/**
 * Hybrid search: embed query → run both legs → RRF-fuse → hydrate top hits.
 */
export async function searchCode(query: string, topK = FINAL_TOP_K): Promise<HybridSearchResult[]> {
  await syncCodeIndex();

  const sanitized = query.trim();
  if (!sanitized) return [];

  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await createEmbedding(sanitized);
  } catch {
    // Model unavailable — degrade to FTS-only search.
  }

  const vectorHits = queryEmbedding
    ? searchVectorLeg(queryEmbedding, VECTOR_TOP_K, VECTOR_THRESHOLD).map((r, i) => ({ ...r, rank: i + 1 }))
    : [];
  const ftsHits = searchFtsLeg(toFtsQuery(sanitized), FTS_TOP_K).map((r, i) => ({ ...r, rank: i + 1 }));

  const fused = fuseRRF(vectorHits, ftsHits);
  const sortedIds = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK);

  const rows = getChunksByIds(sortedIds.map(([id]) => id));
  const scoreById = new Map(sortedIds);
  const vecScoreById = new Map(vectorHits.map(h => [h.id, h.score]));
  const ftsScoreById = new Map(ftsHits.map(h => [h.id, h.score]));

  return rows.map(row => ({
    ...row,
    score: scoreById.get(row.id) ?? 0,
    vectorScore: vecScoreById.get(row.id) ?? null,
    ftsScore: ftsScoreById.get(row.id) ?? null,
  }));
}

/** Format results as a compact snippet list for the user. */
export function formatResults(results: HybridSearchResult[]): string {
  if (results.length === 0) return 'No matching code found.';
  const lines: string[] = [`Found ${results.length} matches:\n`];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    lines.push(`${i + 1}. ${r.filePath}:${r.startLine} — ${r.kind} ${r.name}`);
    lines.push(`   ${r.signature}`);
    lines.push(
      `   [rrf ${r.score.toFixed(4)}${r.vectorScore !== null ? ` | vec ${(r.vectorScore * 100).toFixed(0)}%` : ''}${r.ftsScore !== null ? ` | bm25 ${(r.ftsScore * 100).toFixed(0)}%` : ''}]`,
    );
  }
  return lines.join('\n');
}

export { clearCodeIndex, getCodeIndexStats } from './db.js';
