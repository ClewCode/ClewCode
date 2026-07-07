/**
 * Session Search — SQLite FTS5 full-text search over session transcripts.
 *
 * Indexes JSONL session files lazily: on first search per session, scans
 * all JSONL files and tracks indexed positions. Subsequent searches only
 * scan new/changed files.
 *
 * Uses Bun's built-in `bun:sqlite` (no external dependency).
 * Database: ~/.clew/projects/<slug>/.session_search.db
 */

import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, join } from 'path';
import { getOriginalCwd } from '../../bootstrap/state.js';
import { logForDebugging } from '../../utils/debug.js';
import { logError } from '../../utils/log.js';
import { getProjectDir } from '../../utils/sessionStorage.js';

// ============================================================================
// Types
// ============================================================================

export type SessionSearchResult = {
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  rank: number;
};

export type IndexedFileState = {
  path: string;
  mtime: number;
  bytesIndexed: number;
};

// ============================================================================
// DB Path & Initialization
// ============================================================================

const DB_FILENAME = '.session_search.db';
const MAX_RESULT_CHARS = 500; // Truncate per-result content for token budget
const MAX_RESULTS = 20; // Max results to return per search
const INDEX_DEBOUNCE_MS = 30_000; // Don't re-check for new session files more often than this
const VACUUM_INTERVAL_MS = 3_600_000; // Incremental vacuum every 1 hour of uptime

/**
 * Get the session search database path for the current project.
 */
export function getSessionSearchDbPath(): string {
  const projectDir = getProjectDir(getOriginalCwd());
  return join(projectDir, DB_FILENAME);
}

let _db: Database | null = null;
let backgroundIndexPromise: Promise<number> | null = null;
let backgroundIndexScheduled = false;
let lastIndexCheckAt = 0; // Timestamp of last needsIndexing scan (debounce)
let startupTime = Date.now(); // For vacuum interval tracking

// Precompiled FTS5 search statement — reused across calls
let _searchStmt: ReturnType<Database['query']> | null = null;

/**
 * Get or create the session search database.
 * Creates tables and FTS5 indexes if they don't exist.
 */
export function getSessionSearchDb(): Database {
  if (_db) return _db;

  const dbPath = getSessionSearchDbPath();
  logForDebugging(`[sessionSearch] opening DB at ${dbPath}`);

  _db = new Database(dbPath, { create: true });
  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA synchronous = NORMAL');
  _db.run('PRAGMA auto_vacuum = INCREMENTAL');

  runMigrations(_db);
  return _db;
}

function runMigrations(db: Database): void {
  // Sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      tag TEXT,
      branch TEXT,
      created_at TEXT,
      modified_at TEXT,
      message_count INTEGER DEFAULT 0,
      summary TEXT
    )
  `);

  // Messages table (one row per message turn, text extracted from content blocks)
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      uuid TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      tool_name TEXT,
      created_at TEXT,
      turn_number INTEGER
    )
  `);

  // FTS5 virtual table for full-text search on message content
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      session_id UNINDEXED,
      role UNINDEXED,
      content='messages',
      content_rowid='id',
      tokenize='unicode61'
    )
  `);

  // Triggers to keep FTS index in sync with messages table
  // (only for insert — messages are append-only by design)
  db.run(`
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts (rowid, content, session_id, role)
      VALUES (new.id, new.content, new.session_id, new.role);
    END
  `);

  // Index state: tracks which JSONL files have been indexed
  db.run(`
    CREATE TABLE IF NOT EXISTS index_state (
      file_path TEXT PRIMARY KEY,
      mtime REAL NOT NULL,
      bytes_indexed INTEGER NOT NULL DEFAULT 0,
      last_indexed_at TEXT NOT NULL
    )
  `);

  // Index for session lookups
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_session_id
    ON messages(session_id)
  `);
}

// ============================================================================
// Text Extraction from Content Blocks
// ============================================================================

/**
 * Extract plain text from a content block (text, tool_use, tool_result, etc.).
 */
function extractTextFromBlock(block: Record<string, unknown>, index: number): string {
  const type = block.type as string | undefined;

  if (type === 'text') {
    return (block.text as string) ?? '';
  }

  if (type === 'thinking' || type === 'reasoning') {
    return (block.thinking as string) ?? (block.reasoning as string) ?? '';
  }

  if (type === 'tool_use') {
    const name = (block.name as string) ?? '';
    const input = block.input as Record<string, unknown> | undefined;
    const inputStr = input ? JSON.stringify(input).slice(0, 200) : '';
    return `[tool: ${name}] ${inputStr}`;
  }

  if (type === 'tool_result') {
    const toolContent = block.content;
    if (typeof toolContent === 'string') return toolContent.slice(0, 300);
    if (Array.isArray(toolContent)) {
      return toolContent
        .map((b: Record<string, unknown>) => extractTextFromBlock(b, index))
        .filter(Boolean)
        .join(' ')
        .slice(0, 300);
    }
    return '';
  }

  return '';
}

/**
 * Extract searchable text from a JSONL transcript entry.
 */
function extractMessageText(entry: Record<string, unknown>): string {
  const msg = entry.message as Record<string, unknown> | undefined;
  if (!msg) return '';

  const content = msg.content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block, i) => extractTextFromBlock(block as Record<string, unknown>, i))
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

// ============================================================================
// Indexing
// ============================================================================

/**
 * Get the sessions directory path.
 */
function getSessionsDir(): string {
  return getProjectDir(getOriginalCwd());
}

/**
 * Find all JSONL session files in the sessions directory.
 */
function findSessionFiles(): string[] {
  const sessionsDir = getSessionsDir();
  try {
    const files = readdirSync(sessionsDir);
    return files
      .filter(f => f.endsWith('.jsonl'))
      .map(f => join(sessionsDir, f))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Determine whether a file needs indexing (checking mtime vs indexed state).
 */
function needsIndexing(filePath: string, db: Database): boolean {
  try {
    const stat = statSync(filePath);
    const mtime = stat.mtimeMs;

    const row = db.query('SELECT mtime, bytes_indexed FROM index_state WHERE file_path = ?').get(filePath) as
      | { mtime: number; bytes_indexed: number }
      | undefined;

    if (!row) return true; // Never indexed
    if (row.mtime !== mtime) return true; // File changed

    // Also check if file grew since last index
    if (stat.size > row.bytes_indexed) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Index a single JSONL file into the database.
 * Returns the number of messages indexed.
 */
function indexFile(filePath: string, db: Database): number {
  try {
    const stat = statSync(filePath);
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const sessionId = basename(filePath).replace(/\.jsonl$/, '');

    let indexedCount = 0;
    let turnNumber = 0;

    const insertMessage = db.prepare(`
      INSERT OR IGNORE INTO messages (session_id, uuid, role, content, model, tool_name, created_at, turn_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const upsertState = db.prepare(`
      INSERT OR REPLACE INTO index_state (file_path, mtime, bytes_indexed, last_indexed_at)
      VALUES (?, ?, ?, ?)
    `);

    const insertTransaction = db.transaction(() => {
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          const type = entry.type as string | undefined;

          // Only index user, assistant, and system messages
          if (type !== 'user' && type !== 'assistant' && type !== 'system') continue;

          const text = extractMessageText(entry);
          if (!text || text.trim().length === 0) continue;

          const uuid = entry.uuid as string | undefined;
          const msg = entry.message as Record<string, unknown> | undefined;
          const role = (msg?.role as string) ?? type;
          const model = msg?.model as string | undefined;

          // Detect tool_use name from first content block for assistant messages
          let toolName: string | undefined;
          if (type === 'assistant' && Array.isArray(msg?.content)) {
            const firstBlock = (msg.content as Record<string, unknown>[])[0];
            if (firstBlock?.type === 'tool_use') {
              toolName = firstBlock.name as string;
            }
          }

          const timestamp = entry.timestamp as string | undefined;
          turnNumber++;

          insertMessage.run(
            sessionId,
            uuid ?? null,
            role,
            text.slice(0, MAX_RESULT_CHARS),
            model ?? null,
            toolName ?? null,
            timestamp ?? new Date().toISOString(),
            turnNumber,
          );

          indexedCount++;
        } catch {
          // Skip malformed lines
        }
      }

      upsertState.run(filePath, stat.mtimeMs, stat.size, new Date().toISOString());
    });

    insertTransaction();

    // Update session metadata
    db.run(
      `INSERT OR REPLACE INTO sessions (id, message_count, modified_at)
       VALUES (?, ?, ?)`,
      [sessionId, indexedCount, new Date().toISOString()],
    );

    logForDebugging(`[sessionSearch] indexed ${indexedCount} messages from ${basename(filePath)}`);

    return indexedCount;
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)));
    return 0;
  }
}

/**
 * Index all new/changed JSONL session files.
 * Safe to call multiple times — tracks indexed positions.
 */
export function indexNewSessions(): number {
  const db = getSessionSearchDb();
  const files = findSessionFiles();
  let totalIndexed = 0;

  for (const filePath of files) {
    if (needsIndexing(filePath, db)) {
      totalIndexed += indexFile(filePath, db);
    }
  }

  return totalIndexed;
}

/**
 * Schedule indexing on the next macrotask so session search can return from the
 * already-built FTS index instead of blocking on transcript ingestion.
 *
 * Debounced: skips the filesystem scan if it ran within INDEX_DEBOUNCE_MS.
 * Prevents readdirSync + statSync on every single search call.
 */
export function scheduleSessionSearchIndexing(): void {
  const now = Date.now();
  if (now - lastIndexCheckAt < INDEX_DEBOUNCE_MS) return;
  if (backgroundIndexPromise || backgroundIndexScheduled) return;

  backgroundIndexScheduled = true;
  lastIndexCheckAt = now;
  setTimeout(() => {
    backgroundIndexScheduled = false;
    backgroundIndexPromise = Promise.resolve()
      .then(() => {
        const indexed = indexNewSessions();
        // Periodic incremental vacuum — runs every VACUUM_INTERVAL_MS of uptime
        // to reclaim free pages without blocking (INCREMENTAL mode is per-page).
        if (Date.now() - startupTime > VACUUM_INTERVAL_MS) {
          try {
            getSessionSearchDb().run('PRAGMA incremental_vacuum(100)');
          } catch {
            // Non-critical — vacuum is best-effort
          }
          startupTime = Date.now(); // Reset timer
        }
        return indexed;
      })
      .catch(err => {
        logError(err instanceof Error ? err : new Error(String(err)));
        return 0;
      })
      .finally(() => {
        backgroundIndexPromise = null;
      });
  }, 0);
}

/**
 * Force re-index all session files from scratch.
 */
export function reindexAll(): number {
  const db = getSessionSearchDb();
  db.run('DELETE FROM messages');
  db.run('DELETE FROM messages_fts');
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM index_state');

  lastIndexCheckAt = Date.now(); // Reset debounce so next search doesn't re-scan immediately

  return indexNewSessions();
}

// ============================================================================
// Search
// ============================================================================

/**
 * Search session transcripts using FTS5 full-text search.
 */
export function searchSessions(
  query: string,
  maxResults: number = MAX_RESULTS,
  signal?: AbortSignal,
): SessionSearchResult[] {
  if (!query?.trim()) return [];

  // Refresh in the background. Search uses whatever FTS data is already ready.
  scheduleSessionSearchIndexing();

  const db = getSessionSearchDb();

  // Sanitize the query for FTS5
  // Escape special FTS5 characters and build a prefix query
  const sanitized = query
    .replace(/['"]/g, '') // Remove quotes to avoid FTS5 syntax errors
    .replace(/[^\w\s]/g, ' ') // Replace non-word chars with spaces
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => `"${t}"*`) // Use prefix matching with double quotes
    .join(' ');

  if (!sanitized) return [];

  try {
    // Precompile the FTS search statement on first use, then reuse
    if (!_searchStmt) {
      _searchStmt = db.query(
        `SELECT
          m.session_id,
          m.role,
          m.content,
          m.created_at,
          rank
        FROM messages_fts
        JOIN messages m ON messages_fts.rowid = m.id
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?`,
      );
    }
    const rows = _searchStmt.all(sanitized, maxResults) as {
      session_id: string;
      role: string;
      content: string;
      created_at: string;
      rank: number;
    }[];

    if (signal?.aborted) return [];

    return rows.map(row => ({
      sessionId: row.session_id,
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content.slice(0, MAX_RESULT_CHARS),
      timestamp: row.created_at,
      rank: row.rank,
    }));
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)));
    return [];
  }
}

/**
 * Get indexed statistics.
 */
export function getSearchStats(): {
  totalFiles: number;
  totalMessages: number;
  totalSessions: number;
  lastIndexedAt: string | null;
} {
  const db = getSessionSearchDb();

  const files = db.query('SELECT COUNT(*) as c FROM index_state').get() as { c: number };
  const msgs = db.query('SELECT COUNT(*) as c FROM messages').get() as { c: number };
  const sessions = db.query('SELECT COUNT(*) as c FROM sessions').get() as { c: number };
  const last = db.query('SELECT MAX(last_indexed_at) as t FROM index_state').get() as { t: string | null };

  return {
    totalFiles: files.c,
    totalMessages: msgs.c,
    totalSessions: sessions.c,
    lastIndexedAt: last.t ?? null,
  };
}

/**
 * Close the database connection.
 */
export function closeSessionSearchDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ============================================================================
// Memory Pressure
// ============================================================================

/**
 * Calculate memory pressure as a percentage.
 * This provides a rough estimate of how "full" the memory system is,
 * based on a balance of number of sessions, messages indexed, and
 * approximate token usage.
 *
 * Returns a value 0-100 where:
 * - 0 = no indexed sessions / empty
 * - <50 = low pressure
 * - 50-80 = moderate pressure, consider consolidating
 * - >80 = high pressure, should consolidate
 */
export function getMemoryPressure(): {
  percentage: number;
  sessionsCount: number;
  messagesCount: number;
} {
  const stats = getSearchStats();

  // Scale: 1000 sessions or 50000 messages = 100% pressure
  const sessionPressure = Math.min(stats.totalSessions / 1000, 1) * 50;
  const messagePressure = Math.min(stats.totalMessages / 50000, 1) * 50;

  return {
    percentage: Math.round(sessionPressure + messagePressure),
    sessionsCount: stats.totalSessions,
    messagesCount: stats.totalMessages,
  };
}
