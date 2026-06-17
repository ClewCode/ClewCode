/**
 * Knowledge Graph Memory — replaces flat session tables with entity-relationship graph.
 *
 * Nodes: session, decision, file, tag, topic, model, provider
 * Edges: SESSION → HAS_TAG → TAG
 *        SESSION → DECIDED → DECISION
 *        SESSION → MODIFIED → FILE
 *        DECISION → RELATES_TO → TOPIC
 *        FILE → IMPLEMENTS → TOPIC
 *
 * Query via recursive CTE for multi-hop traversal.
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getSessionId } from '../../bootstrap/state.js';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';

// ── Types ──

export type NodeType = 'session' | 'decision' | 'file' | 'tag' | 'topic' | 'model' | 'provider' | 'pattern';
export type EdgeType = 'has_tag' | 'decided' | 'modified' | 'relates_to' | 'implements' | 'follows' | 'references';

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  summary: string;
  metadata: string; // JSON
  created_at: number;
  updated_at: number;
  access_count: number;
}

export interface GraphEdge {
  source_id: string;
  target_id: string;
  type: EdgeType;
  weight: number;
  created_at: number;
}

// ── DB Setup ──

function getDb(projectRoot: string): Database {
  const dir = join(getClaudeConfigHomeDir(), 'projects', sanitize(projectRoot));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, 'knowledge-graph.db'), { create: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');

  db.run(`CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS edges (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    type TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(source_id, target_id, type)
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name)');
  db.run('CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type)');

  return db;
}

function sanitize(p: string): string {
  return p.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+|_+$/g, '');
}

function nodeId(type: NodeType, name: string): string {
  return `${type}::${name.toLowerCase().replace(/\s+/g, '-')}`;
}

// ── Write API ──

export function ensureNode(
  db: Database,
  type: NodeType,
  name: string,
  summary = '',
  metadata: Record<string, unknown> = {},
): string {
  const id = nodeId(type, name);
  const now = Date.now();

  db.prepare(`
    INSERT INTO nodes (id, type, name, summary, metadata, created_at, updated_at, access_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET
      summary = CASE WHEN ? <> '' THEN ? ELSE summary END,
      metadata = CASE WHEN ? <> '{}' THEN ? ELSE metadata END,
      updated_at = ?,
      access_count = access_count + 1
  `).run(
    id,
    type,
    name,
    summary,
    JSON.stringify(metadata),
    now,
    now,
    summary,
    summary,
    JSON.stringify(metadata),
    JSON.stringify(metadata),
    now,
  );

  return id;
}

export function ensureEdge(db: Database, sourceId: string, targetId: string, type: EdgeType, weight = 1.0): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO edges (source_id, target_id, type, weight, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_id, target_id, type) DO UPDATE SET
      weight = weight + ?
  `).run(sourceId, targetId, type, weight, now, weight);
}

/** Record a full session as a graph. */
export function recordSessionGraph(
  projectRoot: string,
  summary: string,
  decisions: string[],
  files: string[],
  tags: string[],
  model: string,
  provider: string,
): void {
  const db = getDb(projectRoot);
  const sid = getSessionId();

  // Session node
  const sessionNodeId = nodeId('session', sid);
  db.prepare(`INSERT OR REPLACE INTO nodes (id, type, name, summary, metadata, created_at, updated_at)
    VALUES (?, 'session', ?, ?, ?, ?, ?)`).run(
    sessionNodeId,
    sid,
    summary,
    JSON.stringify({ model, provider }),
    Date.now(),
    Date.now(),
  );

  // Model + Provider nodes
  const modelId = ensureNode(db, 'model', model || 'unknown');
  const providerId = ensureNode(db, 'provider', provider || 'unknown');
  ensureEdge(db, sessionNodeId, modelId, 'references');
  ensureEdge(db, sessionNodeId, providerId, 'references');

  // Tag nodes
  for (const tag of tags) {
    const tagId = ensureNode(db, 'tag', tag.toLowerCase());
    ensureEdge(db, sessionNodeId, tagId, 'has_tag');
  }

  // Decision nodes
  for (const d of decisions) {
    const shortName = d.slice(0, 60);
    const decisionId = ensureNode(db, 'decision', shortName, d);
    ensureEdge(db, sessionNodeId, decisionId, 'decided');

    // Link decision to related tags
    for (const tag of tags) {
      const tagId = nodeId('tag', tag.toLowerCase());
      ensureEdge(db, decisionId, tagId, 'relates_to', 0.5);
    }
  }

  // File nodes
  for (const f of files) {
    const fileId = ensureNode(db, 'file', f);
    ensureEdge(db, sessionNodeId, fileId, 'modified');
  }

  db.close();
}

// ── Read API ──

export interface GraphQuery {
  types?: NodeType[];
  tags?: string[];
  since?: number;
  limit?: number;
}

/** Find nodes by type and optional filters. */
export function findNodes(projectRoot: string, query: GraphQuery = {}): GraphNode[] {
  const db = getDb(projectRoot);
  const conditions: string[] = ['1=1'];
  const bindings: (string | number)[] = [];

  if (query.types?.length) {
    const placeholders = query.types.map(() => '?').join(',');
    conditions.push(`type IN (${placeholders})`);
    bindings.push(...query.types);
  }
  if (query.since) {
    conditions.push('created_at >= ?');
    bindings.push(query.since);
  }

  const sql = `SELECT * FROM nodes WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC LIMIT ${query.limit ?? 50}`;
  const rows = db.prepare(sql).all(...bindings) as GraphNode[];
  db.close();
  return rows;
}

/**
 * Multi-hop graph traversal.
 * Example: "What decisions relate to tag 'memory'?"
 *   traverse(projectRoot, 'tag::memory', 'relates_to', 2)
 *   → tag::memory ← relates_to ← decision ← decided ← session
 */
export function traverse(projectRoot: string, startNodeId: string, edgeType?: EdgeType, maxHops = 3): GraphNode[] {
  const db = getDb(projectRoot);

  // Recursive CTE for graph traversal
  const edgeFilter = edgeType ? `AND e.type = '${edgeType}'` : '';
  const sql = `
    WITH RECURSIVE walk(id, hops) AS (
      SELECT ?, 0
      UNION
      SELECT CASE
        WHEN e.source_id = walk.id THEN e.target_id
        WHEN e.target_id = walk.id THEN e.source_id
      END, walk.hops + 1
      FROM edges e JOIN walk ON (e.source_id = walk.id OR e.target_id = walk.id)
      WHERE walk.hops < ? ${edgeFilter}
    )
    SELECT DISTINCT n.* FROM nodes n JOIN walk w ON n.id = w.id WHERE w.hops > 0
    LIMIT 50
  `;

  const rows = db.prepare(sql).all(startNodeId, maxHops) as GraphNode[];
  db.close();
  return rows;
}

/**
 * Get context for a session: decisions, tags, files in one query.
 */
export function getSessionGraph(
  projectRoot: string,
  sessionId: string,
): {
  decisions: GraphNode[];
  tags: GraphNode[];
  files: GraphNode[];
} {
  const sid = nodeId('session', sessionId);
  const decisions = traverse(projectRoot, sid, 'decided', 1);
  const tags = traverse(projectRoot, sid, 'has_tag', 1);
  const files = traverse(projectRoot, sid, 'modified', 1);
  return { decisions, tags, files };
}

/** Get related sessions by shared tags. */
export function getRelatedSessions(projectRoot: string, tags: string[], limit = 5): GraphNode[] {
  if (!tags.length) return [];
  const db = getDb(projectRoot);

  // Find sessions that share at least 2 of the given tags
  const tagIds = tags.map(t => `'tag::${t.toLowerCase().replace(/\s+/g, '-')}'`).join(',');
  try {
    const rows = db
      .prepare(`
      SELECT n.*, COUNT(e2.target_id) as shared_tags
      FROM nodes n
      JOIN edges e1 ON e1.source_id = n.id AND e1.type = 'has_tag'
      JOIN edges e2 ON e2.source_id = n.id AND e2.type = 'has_tag'
        AND e2.target_id IN (${tagIds})
      WHERE n.type = 'session' AND e1.target_id IN (${tagIds})
      GROUP BY n.id
      HAVING shared_tags >= 2
      ORDER BY shared_tags DESC, n.updated_at DESC
      LIMIT ?
    `)
      .all(limit) as GraphNode[];
    db.close();
    return rows;
  } catch {
    db.close();
    return [];
  }
}

// ── Stats ──

export function getGraphStats(projectRoot: string): {
  nodeCount: number;
  edgeCount: number;
  byType: Record<string, number>;
} {
  const db = getDb(projectRoot);
  const nodeCount = (db.prepare('SELECT COUNT(*) as c FROM nodes').get() as { c: number }).c;
  const edgeCount = (db.prepare('SELECT COUNT(*) as c FROM edges').get() as { c: number }).c;
  const byType: Record<string, number> = {};
  const rows = db.prepare('SELECT type, COUNT(*) as c FROM nodes GROUP BY type').all() as { type: string; c: number }[];
  for (const r of rows) byType[r.type] = r.c;
  db.close();
  return { nodeCount, edgeCount, byType };
}
