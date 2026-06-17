/**
 * MemoryDB — SQLite-backed memory store for the MiMo-inspired
 * context reconstruction system.
 *
 * Uses bun:sqlite (built into the Bun runtime, no external dependency).
 * Falls back to in-memory store if bun:sqlite is unavailable (Node.js).
 */

import { Database } from 'bun:sqlite';
import { SCHEMA_SQL, type MemoryRow, type MemoryType, type TimelineRow } from './schema.js';

export type MemoryRecord = {
  id: string;
  projectPath: string;
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
};

export type TimelineRecord = {
  id: string;
  memoryId: string;
  event: string;
  note: string | null;
  createdAt: string;
};

/**
 * Convert snake_case DB row to camelCase MemoryRecord.
 */
function toMemoryRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    projectPath: row.project_path,
    type: row.type as MemoryType,
    content: row.content,
    importance: row.importance,
    confidence: row.confidence,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at,
    createdAt: row.created_at,
  };
}

/**
 * Convert snake_case DB row to camelCase TimelineRecord.
 */
function toTimelineRecord(row: TimelineRow): TimelineRecord {
  return {
    id: row.id,
    memoryId: row.memory_id,
    event: row.event,
    note: row.note,
    createdAt: row.created_at,
  };
}

/**
 * Generate a unique ID for memory/timeline entries.
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Simple string hash for content change detection.
 */
function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get ISO timestamp string.
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * MemoryDB — singleton SQLite-backed memory store.
 */
export class MemoryDB {
  private db: Database;
  private static instance: MemoryDB | null = null;

  private constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(SCHEMA_SQL);
  }

  /**
   * Initialize the singleton MemoryDB instance.
   * Must be called once at startup with the database file path.
   */
  static init(dbPath: string): MemoryDB {
    if (MemoryDB.instance) {
      throw new Error('MemoryDB already initialized');
    }
    MemoryDB.instance = new MemoryDB(dbPath);
    return MemoryDB.instance;
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): MemoryDB {
    if (!MemoryDB.instance) {
      throw new Error('MemoryDB not initialized. Call MemoryDB.init(path) first.');
    }
    return MemoryDB.instance;
  }

  /**
   * Check if MemoryDB has been initialized.
   */
  static isInitialized(): boolean {
    return MemoryDB.instance !== null;
  }

  /**
   * Reset for testing.
   */
  static reset(): void {
    if (MemoryDB.instance) {
      MemoryDB.instance.db.close();
      MemoryDB.instance = null;
    }
  }

  // ── CRUD ─────────────────────────────────────────────────

  /**
   * Save a new memory entry.
   * Returns the generated ID.
   */
  saveMemory(opts: {
    projectPath: string;
    type: MemoryType;
    content: string;
    importance?: number;
    confidence?: number;
  }): string {
    const id = generateId();
    const stmt = this.db.prepare(`
      INSERT INTO memories (id, project_path, type, content, importance, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      opts.projectPath,
      opts.type,
      opts.content,
      opts.importance ?? 0.5,
      opts.confidence ?? 0.5,
      nowISO(),
    );

    // Log creation event
    this.logEvent({ memoryId: id, event: 'created' });

    return id;
  }

  /**
   * Find a memory by its unique key.
   */
  findByKey(key: string): MemoryRecord | null {
    const row = this.db
      .prepare(
        'SELECT m.* FROM memories m JOIN memory_keys k ON m.id = k.memory_id WHERE k.key = ?',
      )
      .get(key) as MemoryRow | null;
    if (!row) return null;
    return toMemoryRecord(row);
  }

  /**
   * Upsert a memory by unique key.
   * If the key exists, updates content/importance/confidence.
   * If not, creates a new memory.
   * Returns { id, action: 'created' | 'updated' | 'unchanged' }.
   */
  upsertMemory(opts: {
    key: string;
    projectPath: string;
    type: MemoryType;
    content: string;
    importance?: number;
    confidence?: number;
  }): { id: string; action: 'created' | 'updated' | 'unchanged' } {
    const existing = this.findByKey(opts.key);

    if (existing) {
      // Check content hash to detect changes
      const newHash = simpleHash(opts.content);
      const oldHash = this.db
        .prepare('SELECT content_hash FROM memory_keys WHERE key = ?')
        .get(opts.key) as { content_hash: string } | undefined;
      if (oldHash && oldHash.content_hash === newHash) {
        return { id: existing.id, action: 'unchanged' };
      }

      this.db
        .prepare(
          'UPDATE memories SET content = ?, importance = ?, confidence = ? WHERE id = ?',
        )
        .run(opts.content, opts.importance ?? 0.5, opts.confidence ?? 0.5, existing.id);
      this.db.prepare('UPDATE memory_keys SET content_hash = ? WHERE key = ?').run(newHash, opts.key);
      this.logEvent({ memoryId: existing.id, event: 'corrected', note: 'content updated by scan' });
      return { id: existing.id, action: 'updated' };
    }

    const id = generateId();
    this.db
      .prepare(
        'INSERT INTO memories (id, project_path, type, content, importance, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, opts.projectPath, opts.type, opts.content, opts.importance ?? 0.5, opts.confidence ?? 0.5, nowISO());
    this.db
      .prepare('INSERT INTO memory_keys (memory_id, key, content_hash) VALUES (?, ?, ?)')
      .run(id, opts.key, simpleHash(opts.content));
    this.logEvent({ memoryId: id, event: 'created' });
    return { id, action: 'created' };
  }

  /**
   * Get a memory by ID.
   */
  getMemory(id: string): MemoryRecord | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | null;
    if (!row) return null;

    // Bump access count
    this.db
      .prepare('UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?')
      .run(nowISO(), id);

    return toMemoryRecord(row);
  }

  /**
   * Query memories by project and optional type filter.
   * Results sorted by importance DESC.
   */
  queryMemories(opts: {
    projectPath: string;
    type?: MemoryType;
    limit?: number;
    minImportance?: number;
  }): MemoryRecord[] {
    const conditions: string[] = ['project_path = ?'];
    const params: unknown[] = [opts.projectPath];

    if (opts.type) {
      conditions.push('type = ?');
      params.push(opts.type);
    }
    if (opts.minImportance !== undefined) {
      conditions.push('importance >= ?');
      params.push(opts.minImportance);
    }

    const sql = `SELECT * FROM memories WHERE ${conditions.join(' AND ')} ORDER BY importance DESC${opts.limit ? ' LIMIT ?' : ''}`;
    if (opts.limit) params.push(opts.limit);

    const rows = this.db.prepare(sql).all(...params) as MemoryRow[];
    return rows.map(toMemoryRecord);
  }

  /**
   * Get memories budgeted by token count, ranked by importance.
   * Fills the budget with the highest-ranked memories first.
   */
  getBudgetedMemories(opts: {
    projectPath: string;
    maxTokens: number;
    /** Estimate tokens from content length (rough: ~4 chars per token) */
    minImportance?: number;
  }): MemoryRecord[] {
    const candidates = this.queryMemories({
      projectPath: opts.projectPath,
      minImportance: opts.minImportance,
    });

    // Rank by importance × recency weight
    const now = Date.now();
    const ranked = candidates.map(m => {
      const lastAccess = m.lastAccessedAt ? (now - new Date(m.lastAccessedAt).getTime()) / 86400000 : 30; // days ago
      const recencyWeight = Math.max(0.5, 1 - lastAccess / 90); // decay over 90 days
      const score = m.importance * m.confidence * recencyWeight;
      return { memory: m, score };
    });
    ranked.sort((a, b) => b.score - a.score);

    // Fill budget
    const result: MemoryRecord[] = [];
    const charsPerToken = 4;
    let used = 0;

    for (const { memory } of ranked) {
      const estimatedTokens = Math.ceil(memory.content.length / charsPerToken) + 10; // +10 for overhead
      if (used + estimatedTokens > opts.maxTokens) continue;
      result.push(memory);
      used += estimatedTokens;
    }

    return result;
  }

  /**
   * Update importance of a memory (e.g., after successful use).
   */
  updateImportance(id: string, delta: number): void {
    this.db
      .prepare('UPDATE memories SET importance = MIN(1.0, MAX(0.0, importance + ?)) WHERE id = ?')
      .run(delta, id);
  }

  /**
   * Update confidence of a memory (e.g., after user correction).
   */
  updateConfidence(id: string, delta: number): void {
    this.db
      .prepare('UPDATE memories SET confidence = MIN(1.0, MAX(0.0, confidence + ?)) WHERE id = ?')
      .run(delta, id);
  }

  /**
   * Delete a memory by ID.
   */
  deleteMemory(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Delete a memory by its unique key.
   */
  deleteMemoryByKey(key: string): boolean {
    const row = this.db.prepare('SELECT memory_id FROM memory_keys WHERE key = ?').get(key) as { memory_id: string } | null;
    if (!row) return false;
    return this.deleteMemory(row.memory_id);
  }

  /**
   * Compute a simple lexical relevance score (0..1) between a query string
   * and a memory's content + key + type fields.
   */
  private computeRelevance(query: string, content: string, key: string, type: string): number {
    const q = query.toLowerCase();
    // Tokenize query into words
    const queryWords = q.split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return 0;

    const haystack = `${key} ${type} ${content}`.toLowerCase();
    let matches = 0;
    for (const word of queryWords) {
      if (haystack.includes(word)) matches++;
    }

    // Normalize to 0..1 with diminishing returns at high match counts
    return Math.min(1, matches / Math.max(1, queryWords.length) * 1.2);
  }

  /**
   * Recall memories ranked by combined score.
   * Score = relevance*0.45 + importance*0.20 + recency*0.15 + access*0.10 + confidence*0.10
   * When no query is given, relevance is 0 for all (falls back to the old formula
   * minus the now-removed confidence weight redistribution).
   * Increments access_count and updates last_accessed_at.
   */
  recallMemories(opts: {
    projectPath: string;
    query?: string;
    limit?: number;
    minImportance?: number;
    verbose?: boolean;
  }): Array<MemoryRecord & { score: number; scoreBreakdown?: Record<string, number> }> {
    const conditions = ['project_path = ?'];
    const params: unknown[] = [opts.projectPath];
    if (opts.minImportance !== undefined) {
      conditions.push('importance >= ?');
      params.push(opts.minImportance);
    }

    const sql = `SELECT m.*, COALESCE(k.key, '') as memory_key FROM memories m LEFT JOIN memory_keys k ON m.id = k.memory_id WHERE ${conditions.join(' AND ')}`;
    const rows = this.db.prepare(sql).all(...params) as Array<MemoryRow & { memory_key: string }>;

    const now = Date.now();
    const scored = rows
      .map(row => {
        const lastAccess = row.last_accessed_at
          ? (now - new Date(row.last_accessed_at).getTime()) / 86400000
          : 90;
        const recency = Math.max(0, 1 - lastAccess / 90);
        const accessBonus = Math.min(1, row.access_count / 20);

        const relevance = opts.query
          ? this.computeRelevance(opts.query, row.content, row.memory_key, row.type)
          : 0;

        const relevanceScore = relevance * 0.45;
        const importanceScore = row.importance * 0.20;
        const recencyScore = recency * 0.15;
        const accessScore = accessBonus * 0.10;
        const confidenceScore = row.confidence * 0.10;

        const score = relevanceScore + importanceScore + recencyScore + accessScore + confidenceScore;

        return {
          ...toMemoryRecord(row),
          score,
          scoreBreakdown: opts.verbose
            ? { relevance: relevanceScore, importance: importanceScore, recency: recencyScore, access: accessScore, confidence: confidenceScore, total: score }
            : undefined,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Bump access_count and last_accessed_at for returned memories
    const limited = opts.limit ? scored.slice(0, opts.limit) : scored;
    const nowISOStr = nowISO();
    for (const mem of limited) {
      this.db
        .prepare('UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?')
        .run(nowISOStr, mem.id);
    }

    return limited;
  }

  /**
   * Log a timeline event for a memory.
   */
  logEvent(opts: { memoryId: string; event: string; note?: string }): string {
    const id = generateId();
    this.db
      .prepare('INSERT INTO memory_timeline (id, memory_id, event, note, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, opts.memoryId, opts.event, opts.note ?? null, nowISO());
    return id;
  }

  /**
   * Get timeline events for a memory.
   */
  getTimeline(memoryId: string): TimelineRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM memory_timeline WHERE memory_id = ? ORDER BY created_at DESC')
      .all(memoryId) as TimelineRow[];
    return rows.map(toTimelineRecord);
  }

  /**
   * Get all recent timeline events across all memories.
   */
  getRecentTimeline(limit = 50): TimelineRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM memory_timeline ORDER BY created_at DESC LIMIT ?')
      .all(limit) as TimelineRow[];
    return rows.map(toTimelineRecord);
  }

  /**
   * Export memories for peer-to-peer sync.
   * Returns memories ordered by importance DESC, limited to `limit`.
   *
   * @param limit  Max memories to export (default 50)
   * @param projectPath  Optional filter — only export memories for this project
   */
  exportMemories(limit = 50, projectPath?: string): MemoryRecord[] {
    let query = 'SELECT * FROM memories';
    const params: unknown[] = [];
    if (projectPath) {
      query += ' WHERE project_path = ?';
      params.push(projectPath);
    }
    query += ' ORDER BY importance DESC LIMIT ?';
    params.push(limit);
    const rows = this.db.prepare(query).all(...params) as MemoryRow[];
    return rows.map(toMemoryRecord);
  }

  // ── Stats ─────────────────────────────────────────────────

  /**
   * Get memory statistics.
   */
  getStats(): { total: number; byType: Record<string, number> } {
    const rows = this.db.prepare('SELECT type, COUNT(*) as count FROM memories GROUP BY type').all() as Array<{
      type: string;
      count: number;
    }>;
    const byType: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byType[row.type] = row.count;
      total += row.count;
    }
    return { total, byType };
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}
