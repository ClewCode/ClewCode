import type { Database } from 'bun:sqlite';
import type { MemoryChunk, SourceDocument } from './types.js';

export function getSource(db: Database, id: string): SourceDocument | null {
  const row = db.query('SELECT * FROM sources WHERE id = ?').get(id) as Record<string, any> | undefined;
  if (!row) return null;

  return {
    id: row.id,
    sourceType: row.source_type,
    uri: row.uri,
    title: row.title,
    sourcePath: row.source_path,
    contentHash: row.content_hash,
    truthPriority: row.truth_priority,
    editable: row.editable,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function upsertSource(db: Database, source: SourceDocument): void {
  const query = db.prepare(`
    INSERT OR REPLACE INTO sources (id, source_type, uri, title, source_path, content_hash, truth_priority, editable, created_at, updated_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  query.run(
    source.id,
    source.sourceType,
    source.uri,
    source.title ?? null,
    source.sourcePath ?? null,
    source.contentHash,
    source.truthPriority,
    source.editable,
    source.createdAt,
    source.updatedAt,
    source.lastSeenAt ?? null,
  );
}

export function deleteSource(db: Database, id: string): void {
  // Use transaction to ensure complete cleanup
  const deleteTx = db.transaction(() => {
    db.prepare('DELETE FROM chunks_fts WHERE source_id = ?').run(id);
    db.prepare('DELETE FROM chunks WHERE source_id = ?').run(id);
    db.prepare('DELETE FROM sources WHERE id = ?').run(id);
  });
  deleteTx();
}

export function insertChunks(db: Database, chunks: MemoryChunk[], title: string = ''): void {
  if (chunks.length === 0) return;

  const insertChunkStmt = db.prepare(`
    INSERT OR REPLACE INTO chunks (id, source_id, chunk_index, markdown, token_count, content_hash, parent_hash, truth_priority, created_at, updated_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFtsStmt = db.prepare(`
    INSERT INTO chunks_fts (id, source_id, title, markdown, entities)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertTx = db.transaction(() => {
    for (const chunk of chunks) {
      insertChunkStmt.run(
        chunk.id,
        chunk.sourceId,
        chunk.chunkIndex,
        chunk.markdown,
        chunk.tokenCount,
        chunk.contentHash,
        chunk.parentHash ?? null,
        chunk.truthPriority,
        chunk.createdAt,
        chunk.updatedAt,
        chunk.lastSeenAt ?? null,
      );

      insertFtsStmt.run(
        chunk.id,
        chunk.sourceId,
        title,
        chunk.markdown,
        '', // optional entities extraction for later
      );
    }
  });

  insertTx();
}

export function getAllSources(db: Database): SourceDocument[] {
  const rows = db.query('SELECT * FROM sources').all() as Record<string, any>[];
  return rows.map(row => ({
    id: row.id,
    sourceType: row.source_type,
    uri: row.uri,
    title: row.title,
    sourcePath: row.source_path,
    contentHash: row.content_hash,
    truthPriority: row.truth_priority,
    editable: row.editable,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  }));
}

export interface FTSMatch {
  id: string;
  sourceId: string;
  title: string;
  markdown: string;
}

export function searchChunksFTS(db: Database, queryStr: string, limit: number = 20): FTSMatch[] {
  // Sanitize the search query to prevent FTS5 syntax errors
  const sanitized = queryStr
    .replace(/['"]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => `"${t}"*`)
    .join(' ');

  if (!sanitized) return [];

  try {
    const rows = db
      .query(
        `SELECT id, source_id, title, markdown
         FROM chunks_fts
         WHERE chunks_fts MATCH ?
         LIMIT ?`,
      )
      .all(sanitized, limit) as Record<string, any>[];

    return rows.map(row => ({
      id: row.id,
      sourceId: row.source_id,
      title: row.title ?? '',
      markdown: row.markdown ?? '',
    }));
  } catch {
    return [];
  }
}
