/**
 * SQLite implementation of TasteStore using bun:sqlite.
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DOT_CLEW, TASTE_DIR } from '../../utils/clewPaths.js';
import { getCwd } from '../../utils/cwd.js';
import type {
  TasteCategory,
  TasteQuery,
  TasteRule,
  TasteScope,
  TasteSource,
  TasteStatus,
  TasteStore,
} from '../types.js';

interface TasteDbRow {
  id: string;
  rule: string;
  category: string;
  scope_type: string;
  scope_language: string | null;
  scope_repository: string | null;
  confidence: number;
  status: string;
  source: string;
  evidence_count: number;
  positive_evidence: number;
  negative_evidence: number;
  created_at: string;
  updated_at: string;
  last_observed_at: string;
}

export class SqliteTasteStore implements TasteStore {
  private projectDb: Database | null = null;
  private globalDb: Database | null = null;
  private customProjectDbPath?: string;
  private customGlobalDbPath?: string;

  constructor(options?: { projectDbPath?: string; globalDbPath?: string }) {
    this.customProjectDbPath = options?.projectDbPath;
    this.customGlobalDbPath = options?.globalDbPath;
  }

  private getProjectDb(): Database {
    if (this.projectDb) return this.projectDb;

    const dbPath = this.customProjectDbPath ?? join(this.getWorkspaceRoot(), DOT_CLEW, TASTE_DIR, 'taste.db');
    this.ensureDir(dbPath);

    this.projectDb = new Database(dbPath, { create: true });
    this.projectDb.run('PRAGMA journal_mode = WAL');
    this.projectDb.run('PRAGMA synchronous = NORMAL');
    this.initSchema(this.projectDb);
    return this.projectDb;
  }

  private getGlobalDb(): Database {
    if (this.globalDb) return this.globalDb;

    const dbPath = this.customGlobalDbPath ?? join(homedir(), DOT_CLEW, TASTE_DIR, 'taste.db');
    this.ensureDir(dbPath);

    this.globalDb = new Database(dbPath, { create: true });
    this.globalDb.run('PRAGMA journal_mode = WAL');
    this.globalDb.run('PRAGMA synchronous = NORMAL');
    this.initSchema(this.globalDb);
    return this.globalDb;
  }

  private ensureDir(filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private getWorkspaceRoot(): string {
    try {
      return getCwd();
    } catch {
      return process.cwd();
    }
  }

  private initSchema(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS taste_rules (
        id TEXT PRIMARY KEY,
        rule TEXT NOT NULL,
        category TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_language TEXT,
        scope_repository TEXT,
        confidence REAL NOT NULL DEFAULT 1.0,
        status TEXT NOT NULL DEFAULT 'active',
        source TEXT NOT NULL DEFAULT 'explicit',
        evidence_count INTEGER NOT NULL DEFAULT 0,
        positive_evidence INTEGER NOT NULL DEFAULT 0,
        negative_evidence INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_taste_rules_category ON taste_rules(category);
      CREATE INDEX IF NOT EXISTS idx_taste_rules_status ON taste_rules(status);
      CREATE INDEX IF NOT EXISTS idx_taste_rules_confidence ON taste_rules(confidence);
    `);
  }

  private rowToRule(row: TasteDbRow): TasteRule {
    return {
      id: row.id,
      rule: row.rule,
      category: row.category as TasteCategory,
      scope: {
        type: row.scope_type as 'global' | 'project',
        language: row.scope_language ?? undefined,
        repository: row.scope_repository ?? undefined,
      },
      confidence: row.confidence,
      status: row.status as TasteStatus,
      source: row.source as TasteSource,
      evidenceCount: row.evidence_count,
      positiveEvidence: row.positive_evidence,
      negativeEvidence: row.negative_evidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastObservedAt: row.last_observed_at,
    };
  }

  async get(id: string): Promise<TasteRule | null> {
    // Check project DB first
    try {
      const projDb = this.getProjectDb();
      const projRow = projDb.query('SELECT * FROM taste_rules WHERE id = ?').get(id) as TasteDbRow | null;
      if (projRow) return this.rowToRule(projRow);
    } catch {
      // ignore
    }

    // Fallback to global DB
    try {
      const globDb = this.getGlobalDb();
      const globRow = globDb.query('SELECT * FROM taste_rules WHERE id = ?').get(id) as TasteDbRow | null;
      if (globRow) return this.rowToRule(globRow);
    } catch {
      // ignore
    }

    return null;
  }

  async list(query?: TasteQuery): Promise<TasteRule[]> {
    const rulesMap = new Map<string, TasteRule>();

    // 1. Fetch Global rules (if query allows)
    if (!query?.scopeType || query.scopeType === 'global') {
      try {
        const globDb = this.getGlobalDb();
        const globRows = this.queryDb(globDb, query) as TasteDbRow[];
        for (const row of globRows) {
          const rule = this.rowToRule(row);
          rulesMap.set(rule.id, rule);
        }
      } catch {
        // ignore
      }
    }

    // 2. Fetch Project rules (overrides global rules with matching ID)
    if (!query?.scopeType || query.scopeType === 'project') {
      try {
        const projDb = this.getProjectDb();
        const projRows = this.queryDb(projDb, query) as TasteDbRow[];
        for (const row of projRows) {
          const rule = this.rowToRule(row);
          rulesMap.set(rule.id, rule);
        }
      } catch {
        // ignore
      }
    }

    let results = Array.from(rulesMap.values());

    // Apply in-memory search filter if specified
    if (query?.search) {
      const needle = query.search.toLowerCase();
      results = results.filter(r => r.rule.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle));
    }

    // Apply limit if specified
    if (query?.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  private queryDb(db: Database, query?: TasteQuery): unknown[] {
    let sql = 'SELECT * FROM taste_rules WHERE 1=1';
    const params: unknown[] = [];

    if (query?.category) {
      sql += ' AND category = ?';
      params.push(query.category);
    }

    if (query?.status) {
      if (Array.isArray(query.status)) {
        if (query.status.length > 0) {
          sql += ` AND status IN (${query.status.map(() => '?').join(', ')})`;
          params.push(...query.status);
        }
      } else {
        sql += ' AND status = ?';
        params.push(query.status);
      }
    }

    if (query?.minConfidence !== undefined) {
      sql += ' AND confidence >= ?';
      params.push(query.minConfidence);
    }

    if (query?.language) {
      sql += ' AND (scope_language IS NULL OR scope_language = ?)';
      params.push(query.language);
    }

    sql += ' ORDER BY confidence DESC, updated_at DESC';

    return db.query(sql).all(...(params as [string])) as unknown[];
  }

  async upsert(rule: TasteRule): Promise<void> {
    const targetDb = rule.scope.type === 'global' ? this.getGlobalDb() : this.getProjectDb();
    const now = new Date().toISOString();

    const existing = targetDb.query('SELECT created_at FROM taste_rules WHERE id = ?').get(rule.id) as {
      created_at: string;
    } | null;

    targetDb
      .query(
        `
      INSERT OR REPLACE INTO taste_rules (
        id, rule, category, scope_type, scope_language, scope_repository,
        confidence, status, source, evidence_count, positive_evidence, negative_evidence,
        created_at, updated_at, last_observed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        rule.id,
        rule.rule,
        rule.category,
        rule.scope.type,
        rule.scope.language ?? null,
        rule.scope.repository ?? null,
        rule.confidence,
        rule.status,
        rule.source,
        rule.evidenceCount,
        rule.positiveEvidence,
        rule.negativeEvidence,
        existing?.created_at ?? rule.createdAt ?? now,
        now,
        rule.lastObservedAt ?? now,
      );
  }

  async disable(id: string): Promise<boolean> {
    let affected = false;
    try {
      const projDb = this.getProjectDb();
      const res = projDb
        .query("UPDATE taste_rules SET status = 'disabled', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), id);
      if (res.changes > 0) affected = true;
    } catch {
      // ignore
    }

    try {
      const globDb = this.getGlobalDb();
      const res = globDb
        .query("UPDATE taste_rules SET status = 'disabled', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), id);
      if (res.changes > 0) affected = true;
    } catch {
      // ignore
    }

    return affected;
  }

  async enable(id: string): Promise<boolean> {
    let affected = false;
    try {
      const projDb = this.getProjectDb();
      const res = projDb
        .query("UPDATE taste_rules SET status = 'active', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), id);
      if (res.changes > 0) affected = true;
    } catch {
      // ignore
    }

    try {
      const globDb = this.getGlobalDb();
      const res = globDb
        .query("UPDATE taste_rules SET status = 'active', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), id);
      if (res.changes > 0) affected = true;
    } catch {
      // ignore
    }

    return affected;
  }

  async remove(id: string): Promise<boolean> {
    let deleted = false;
    try {
      const projDb = this.getProjectDb();
      const res = projDb.query('DELETE FROM taste_rules WHERE id = ?').run(id);
      if (res.changes > 0) deleted = true;
    } catch {
      // ignore
    }

    try {
      const globDb = this.getGlobalDb();
      const res = globDb.query('DELETE FROM taste_rules WHERE id = ?').run(id);
      if (res.changes > 0) deleted = true;
    } catch {
      // ignore
    }

    return deleted;
  }

  async clear(scopeType?: 'global' | 'project'): Promise<void> {
    if (!scopeType || scopeType === 'project') {
      try {
        const projDb = this.getProjectDb();
        projDb.run('DELETE FROM taste_rules');
      } catch {
        // ignore
      }
    }

    if (!scopeType || scopeType === 'global') {
      try {
        const globDb = this.getGlobalDb();
        globDb.run('DELETE FROM taste_rules');
      } catch {
        // ignore
      }
    }
  }

  close(): void {
    if (this.projectDb) {
      this.projectDb.close();
      this.projectDb = null;
    }
    if (this.globalDb) {
      this.globalDb.close();
      this.globalDb = null;
    }
  }
}
