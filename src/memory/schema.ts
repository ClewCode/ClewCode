/**
 * Memory Database Schema
 *
 * SQLite schema for the durable memory system.
 * Uses bun:sqlite which is built into the Bun runtime.
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id            TEXT PRIMARY KEY,
  project_path  TEXT NOT NULL,
  type          TEXT NOT NULL,
  content       TEXT NOT NULL,
  importance    REAL NOT NULL DEFAULT 0.5,
  confidence    REAL NOT NULL DEFAULT 0.5,
  access_count  INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_keys (
  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  key       TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS memory_timeline (
  id         TEXT PRIMARY KEY,
  memory_id  TEXT REFERENCES memories(id) ON DELETE CASCADE,
  event      TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_path);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_memory ON memory_timeline(memory_id);
CREATE INDEX IF NOT EXISTS idx_timeline_event ON memory_timeline(event);
`;

export const MEMORY_TYPES = [
  'architecture',
  'taste',
  'decision',
  'bug',
  'provider',
  'workflow',
  'user',
  'feedback',
  'reference',
  'task_progress',
  'command',
  'note',
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export type MemoryRow = {
  id: string;
  project_path: string;
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
};

export type TimelineRow = {
  id: string;
  memory_id: string;
  event: string;
  note: string | null;
  created_at: string;
};
