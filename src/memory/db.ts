import { Database } from 'bun:sqlite';
import { join } from 'path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { getFsImplementation } from '../utils/fsOperations.js';

let _db: Database | null = null;

export function getMemoryDb(cwd: string): Database {
  if (_db) return _db;

  const fsImpl = getFsImplementation();
  const indexDir = join(cwd, DOT_CLEW, 'index');
  const dbPath = join(indexDir, 'chunks.db');

  _db = new Database(dbPath, { create: true });
  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA synchronous = NORMAL');

  runMemoryMigrations(_db);
  return _db;
}

export function closeMemoryDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function runMemoryMigrations(db: Database): void {
  // Sources table
  db.run(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      uri TEXT NOT NULL,
      title TEXT,
      source_path TEXT,
      content_hash TEXT NOT NULL,
      truth_priority INTEGER NOT NULL DEFAULT 50,
      editable INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT
    )
  `);

  // Chunks table
  db.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      markdown TEXT NOT NULL,
      token_count INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      parent_hash TEXT,
      truth_priority INTEGER NOT NULL DEFAULT 50,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT,
      FOREIGN KEY(source_id) REFERENCES sources(id)
    )
  `);

  // Chunks FTS5 table
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      id UNINDEXED,
      source_id UNINDEXED,
      title,
      markdown,
      entities,
      tokenize = 'unicode61'
    )
  `);
}
