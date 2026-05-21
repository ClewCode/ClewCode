import type { Database } from 'bun:sqlite';
import { getMemoryDb } from './db.js';
import { getSource, searchChunksFTS } from './store.js';
import type { MemorySearchResult } from './types.js';

export async function searchMemories(cwd: string, query: string, limit: number = 10): Promise<MemorySearchResult[]> {
  const db = getMemoryDb(cwd);
  const ftsMatches = searchChunksFTS(db, query, limit * 2);

  const results: MemorySearchResult[] = [];

  for (const match of ftsMatches) {
    // 1. Fetch exact chunk & source details
    const chunkRow = db.query('SELECT * FROM chunks WHERE id = ?').get(match.id) as Record<string, any> | undefined;
    if (!chunkRow) continue;

    const sourceRow = db.query('SELECT * FROM sources WHERE id = ?').get(match.sourceId) as
      | Record<string, any>
      | undefined;
    if (!sourceRow) continue;

    // 2. Score match based on priority and recency
    const priority = sourceRow.truth_priority || 50;

    // Normalize priority: 0 to 1 scale (priority 50 to 80 maps to 0.5 to 0.8)
    const priorityFactor = priority / 100;

    // Recency factor: boost files updated within last 24 hours
    let recencyFactor = 0;
    const updatedAt = new Date(sourceRow.updated_at).getTime();
    const ageMs = Date.now() - updatedAt;
    if (ageMs < 24 * 60 * 60 * 1000) {
      recencyFactor = 0.15;
    } else if (ageMs < 7 * 24 * 60 * 60 * 1000) {
      recencyFactor = 0.08;
    }

    // Lexical factor: top FTS matches score higher
    const lexicalFactor = 0.4;

    const score = Math.min(0.4 + priorityFactor * 0.45 + recencyFactor, 1.0);

    results.push({
      id: match.id,
      title: sourceRow.title || sourceRow.uri,
      sourcePath: sourceRow.source_path || sourceRow.uri,
      sourceType: sourceRow.source_type,
      excerpt: chunkRow.markdown,
      score,
      contentHash: chunkRow.content_hash,
      lastSeenAt: sourceRow.last_seen_at || new Date().toISOString(),
      stale: false,
    });
  }

  // Sort results by score descending
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
