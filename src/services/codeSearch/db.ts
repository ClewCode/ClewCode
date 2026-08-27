/**
 * Hybrid Code Search — Cursor-style semantic + keyword retrieval over codebase chunks.
 *
 * Two retrieval legs, fused with Reciprocal Rank Fusion (RRF):
 *   1. Vector — sqlite-vec KNN over chunk embeddings (semantic meaning)
 *   2. FTS5  — BM25 full-text over identifiers and code text (exact tokens)
 *
 * Chunks are function/class-level slices produced by reusing the existing
 * Repo Map symbol extractor. DB lives at .clew/cache/code_search.db.
 *
 * Schema:
 *   code_chunks:   metadata + serialized embedding (source of truth)
 *   vec_index:     vec0 virtual table (rowid-linked), optional
 *   code_chunks_fts: FTS5 table over identifier+code text (BM25 leg)
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'path';
import type { SymbolSignature } from '../../repomap/types.js';
import { DOT_CLEW } from '../../utils/clewPaths.js';
import { getCwd } from '../../utils/cwd.js';
import { logForDebugging } from '../../utils/debug.js';

const EMBEDDING_DIM = 768;

let _db: Database | null = null;
let _vecLoaded = false;

export interface CodeChunkRow {
  id: number;
  filePath: string;
  startLine: number;
  endLine: number;
  name: string;
  kind: string;
  signature: string;
}

export interface CodeSearchHit extends CodeChunkRow {
  vectorScore: number | null;
  ftsScore: number | null;
  rrfScore: number;
}

function getDbPath(): string {
  return join(getCwd(), DOT_CLEW, 'cache', 'code_search.db');
}

function getDb(): Database {
  if (_db) return _db;

  const dbPath = getDbPath();
  const dir = join(dbPath, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(dbPath, { create: true });
  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA synchronous = NORMAL');

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require('sqlite-vec') as { load(db: Database): void };
    sqliteVec.load(_db);
    _vecLoaded = true;
  } catch (e) {
    _vecLoaded = false;
    logForDebugging(`[codeSearch] sqlite-vec unavailable, vector leg disabled: ${e}`, { level: 'debug' });
  }

  _db.run(`
    CREATE TABLE IF NOT EXISTS code_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      chunk_key TEXT NOT NULL UNIQUE,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      signature TEXT NOT NULL,
      embedding BLOB NOT NULL,
      content_hash TEXT NOT NULL,
      indexed_at INTEGER NOT NULL
    )
  `);
  _db.run('CREATE INDEX IF NOT EXISTS idx_chunks_file ON code_chunks(file_path)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_chunks_indexed_at ON code_chunks(indexed_at DESC)');

  if (_vecLoaded) {
    _db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_index USING vec0(
        embedding float[${EMBEDDING_DIM}]
      )
    `);
  }

  _db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS code_chunks_fts USING fts5(
      name, signature, content='code_chunks', content_rowid='id'
    )
  `);

  return _db;
}

/** Serialize a float array into the BLOB format sqlite-vec expects. */
function serializeEmbedding(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

/**
 * True when the chunk is missing, its content hash changed, or its
 * embedding was never computed (model was unavailable at index time).
 */
export function chunkNeedsUpdate(filePath: string, sym: SymbolSignature, textHash: string): boolean {
  const db = getDb();
  const chunkKey = `${filePath}:${sym.line}:${sym.name}`;
  const existing = db
    .prepare('SELECT content_hash, length(embedding) AS emb_len FROM code_chunks WHERE chunk_key = ?')
    .get(chunkKey) as { content_hash: string; emb_len: number } | undefined;
  return !existing || existing.content_hash !== textHash || existing.emb_len === 0;
}

/**
 * Store one chunk (delete-then-insert keeps vec_index and fts in sync).
 * Call only after chunkNeedsUpdate returned true.
 * Pass embedding=null when the embedding model is unavailable — the chunk
 * is still FTS-searchable, and chunkNeedsUpdate will flag it for
 * re-embedding once the model becomes available.
 */
export function storeChunk(filePath: string, sym: SymbolSignature, textHash: string, embedding: number[] | null): void {
  const db = getDb();
  const chunkKey = `${filePath}:${sym.line}:${sym.name}`;

  const existing = db.prepare('SELECT id FROM code_chunks WHERE chunk_key = ?').get(chunkKey) as
    | { id: number }
    | undefined;
  if (existing) deleteChunkById(existing.id);

  const blob = embedding ? serializeEmbedding(embedding) : Buffer.alloc(0);
  const result = db
    .prepare(
      `INSERT INTO code_chunks (file_path, chunk_key, start_line, end_line, name, kind, signature, embedding, content_hash, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(filePath, chunkKey, sym.line, sym.line, sym.name, sym.kind, sym.signature, blob, textHash, Date.now());

  const rowId = Number(result.lastInsertRowid);
  if (embedding && _vecLoaded) {
    db.prepare('INSERT INTO vec_index (rowid, embedding) VALUES (?, ?)').run(rowId, blob);
  }
  db.prepare('INSERT INTO code_chunks_fts(rowid, name, signature) VALUES (?, ?, ?)').run(
    rowId,
    sym.name,
    sym.signature,
  );
}

/** Remove a chunk and its index entries by primary key. */
function deleteChunkById(id: number): void {
  const db = getDb();
  if (_vecLoaded) db.prepare('DELETE FROM vec_index WHERE rowid = ?').run(id);
  db.prepare('DELETE FROM code_chunks_fts WHERE rowid = ?').run(id);
  db.prepare('DELETE FROM code_chunks WHERE id = ?').run(id);
}

/** Drop all chunks belonging to a file (called when the file vanished). */
export function removeFileChunks(filePath: string): void {
  const db = getDb();
  const rows = db.prepare('SELECT id FROM code_chunks WHERE file_path = ?').all(filePath) as Array<{ id: number }>;
  for (const row of rows) deleteChunkById(row.id);
}

/** Delete a file's chunks whose key is not in keepKeys (symbols that moved/vanished). */
export function pruneFileChunks(filePath: string, keepKeys: ReadonlySet<string>): number {
  const db = getDb();
  const rows = db.prepare('SELECT id, chunk_key FROM code_chunks WHERE file_path = ?').all(filePath) as Array<{
    id: number;
    chunk_key: string;
  }>;
  let removed = 0;
  for (const row of rows) {
    if (!keepKeys.has(row.chunk_key)) {
      deleteChunkById(row.id);
      removed++;
    }
  }
  return removed;
}

/** Drop all chunks whose file_path is not in the current set of known files. */
export function removeMissingFiles(existingPaths: ReadonlySet<string>): number {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT file_path FROM code_chunks').all() as Array<{ file_path: string }>;
  let removed = 0;
  for (const { file_path } of rows) {
    if (!existingPaths.has(file_path)) {
      removeFileChunks(file_path);
      removed++;
    }
  }
  return removed;
}

// ── Search legs ───────────────────────────────────────────────────────────────

interface LegResult {
  id: number;
  score: number; // normalized 0..1 (cosine for vector, rank-based for BM25)
}

/** Vector KNN over chunk embeddings. Returns [] when extension unavailable. */
export function searchVectorLeg(queryEmbedding: number[], topK: number, threshold: number): LegResult[] {
  if (!_vecLoaded) return [];
  const db = getDb();

  try {
    const rows = db
      .prepare(
        `SELECT c.id, v.distance
         FROM vec_index v JOIN code_chunks c ON c.id = v.rowid
         WHERE v.embedding MATCH ? AND k = ?
         ORDER BY v.distance`,
      )
      .all(serializeEmbedding(queryEmbedding), topK) as Array<{ id: number; distance: number }>;

    return rows.map(r => ({ id: r.id, score: 1 - (r.distance * r.distance) / 2 })).filter(r => r.score >= threshold);
  } catch (e) {
    logForDebugging(`[codeSearch] vector KNN failed: ${e}`, { level: 'debug' });
    return [];
  }
}

/**
 * FTS5 BM25 leg. Returns every positive match scored by bm25() rank
 * (more negative = better); we normalize into a 0..1 "relevance" so both
 * legs are graphable on one scale. Input is pre-sanitized by callers.
 */
export function searchFtsLeg(sanitizedQuery: string, topK: number): LegResult[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        `SELECT rowid AS id, bm25(code_chunks_fts) AS rank
         FROM code_chunks_fts WHERE code_chunks_fts MATCH ?
         ORDER BY rank LIMIT ?`,
      )
      .all(sanitizedQuery, topK) as Array<{ id: number; rank: number }>;

    // bm25() returns negative values where more negative = more relevant.
    const ranks = rows.map(r => r.rank).filter(r => r < 0);
    const maxMagnitude = Math.max(...ranks.map(r => Math.abs(r)), 1);
    return rows.map(r => ({
      id: r.id,
      score: r.rank < 0 ? Math.abs(r.rank) / maxMagnitude : 0,
    }));
  } catch (e) {
    logForDebugging(`[codeSearch] FTS leg failed: ${e}`, { level: 'debug' });
    return [];
  }
}

/** Escape an arbitrary user string into a safe FTS5 prefix query ("tok* OR tok2*"). */
export function toFtsQuery(raw: string): string {
  const tokens = raw
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(t => t.length > 1)
    .slice(0, 12)
    .map(t => `"${t}"*`);
  return tokens.length > 0 ? tokens.join(' OR ') : '""';
}

// ── Fusion ────────────────────────────────────────────────────────────────────

const RRF_K = 60; // standard reciprocal-rank-fusion constant

/**
 * Fuse two ranked lists via Reciprocal Rank Fusion:
 *   score(d) = Σ over legs of weight / (k + rank)
 * Rank positions start at 1. Hits present in both lists reinforce each other.
 */
export function fuseRRF(
  vectorHits: Array<LegResult & { rank: number }>,
  ftsHits: Array<LegResult & { rank: number }>,
  weights = { vector: 1, fts: 1 },
): Map<number, number> {
  const scores = new Map<number, number>();
  for (const hit of vectorHits) {
    scores.set(hit.id, (scores.get(hit.id) ?? 0) + weights.vector / (RRF_K + hit.rank));
  }
  for (const hit of ftsHits) {
    scores.set(hit.id, (scores.get(hit.id) ?? 0) + weights.fts / (RRF_K + hit.rank));
  }
  return scores;
}

/** Fetch full chunk metadata for the given ids, preserving order of ids array. */
export function getChunksByIds(ids: number[]): CodeChunkRow[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT id, file_path AS filePath, start_line AS startLine, end_line AS endLine, name, kind, signature
       FROM code_chunks WHERE id IN (${placeholders})`,
    )
    .all(...ids) as CodeChunkRow[];
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(id => byId.get(id)).filter((r): r is CodeChunkRow => r !== undefined);
}

/** Index statistics for status display. */
export function getCodeIndexStats(): { totalChunks: number; totalFiles: number; vecLoaded: boolean } {
  const db = getDb();
  const totalChunks = (db.prepare('SELECT COUNT(*) AS c FROM code_chunks').get() as { c: number }).c;
  const totalFiles = (db.prepare('SELECT COUNT(DISTINCT file_path) AS c FROM code_chunks').get() as { c: number }).c;
  return { totalChunks, totalFiles, vecLoaded: _vecLoaded };
}

/** Clear the whole index (destructive). Used by refresh subcommand. */
export function clearCodeIndex(): void {
  const db = getDb();
  db.run('DELETE FROM code_chunks');
  if (_vecLoaded) db.run('DELETE FROM vec_index');
  db.run('DELETE FROM code_chunks_fts');
}

/** Close DB connection (for tests / shutdown). */
export function closeCodeSearchDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _vecLoaded = false;
  }
}
