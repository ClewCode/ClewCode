/**
 * Memory Schema — filesystem SoT, no SQLite.
 * SCHEMA_SQL kept as empty stub for compat.
 */
export const SCHEMA_SQL = ``;

export const MEMORY_TYPES = [
  'architecture',
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
