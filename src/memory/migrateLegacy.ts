/**
 * Legacy Migration — import old session-memory.db into MemoryDB.
 *
 * Reads the pre-existing `session-memory.db` (from longTermMemory) and
 * upserts each session/digest/topic as a typed memory into the new
 * SQLite MemoryDB. Idempotent: uses deterministic keys so repeated
 * migration is a no-op.
 */

import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCwd } from '../utils/cwd.js';
import { getClaudeConfigHomeDir } from '../utils/envUtils.js';
import { MemoryDB } from './database.js';

function sanitize(p: string): string {
  return p.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+|_+$/g, '');
}

export type MigrationResult = {
  sessionsImported: number;
  digestsImported: number;
  errors: string[];
};

/**
 * Migrate all data from the old `session-memory.db` into MemoryDB.
 * Idempotent: skips records that already exist by deterministic key.
 */
export function migrateFromSessionDB(): MigrationResult {
  const result: MigrationResult = { sessionsImported: 0, digestsImported: 0, errors: [] };

  if (!MemoryDB.isInitialized()) return result;

  const cwd = getCwd();
  const oldDbPath = join(getClaudeConfigHomeDir(), 'projects', sanitize(cwd), 'session-memory.db');
  if (!existsSync(oldDbPath)) return result;

  let oldDb: Database | null = null;
  try {
    oldDb = new Database(oldDbPath);

    const db = MemoryDB.getInstance();

    // ── Migrate sessions ──────────────────────────────────────
    try {
      const sessions = oldDb
        .prepare(
          `SELECT session_id, start_time, end_time, model, provider, summary, key_decisions, active_files, tags
           FROM sessions ORDER BY start_time`,
        )
        .all() as Array<{
        session_id: string;
        start_time: number;
        end_time: number;
        model: string;
        provider: string;
        summary: string;
        key_decisions: string;
        active_files: string;
        tags: string;
      }>;

      for (const s of sessions) {
        if (!s.session_id) continue;

        const decisions: string[] = safeParseJson(s.key_decisions);
        const files: string[] = safeParseJson(s.active_files);
        const tagList: string[] = safeParseJson(s.tags);
        const dateStr = new Date(s.end_time).toISOString().slice(0, 10);

        // Build a rich summary
        const content = [
          s.summary ? `Session: ${s.summary}` : `Session on ${dateStr}`,
          decisions.length > 0 ? `Decisions: ${decisions.join(', ')}` : '',
          files.length > 0 ? `Files: ${files.join(', ')}` : '',
          `Model: ${s.model || 'unknown'}`,
          tagList.length > 0 ? `Tags: ${tagList.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const key = `session.${s.session_id}`;
        const existing = db.findByKey(key);
        if (existing) continue; // Already imported

        db.upsertMemory({
          key,
          projectPath: cwd,
          type: 'note',
          content,
          importance: 0.5,
          confidence: 0.6,
        });

        // Log migration event
        db.logEvent({
          memoryId: db.findByKey(key)!.id,
          event: 'session_imported',
          note: `date=${dateStr} decisions=${decisions.length} files=${files.length}`,
        });

        result.sessionsImported++;
      }
    } catch (e) {
      result.errors.push(`Session migration: ${e}`);
    }

    // ── Migrate digests ───────────────────────────────────────
    try {
      const digests = oldDb
        .prepare(
          `SELECT period, type, summary, key_decisions, patterns, session_count
           FROM digests ORDER BY created_at`,
        )
        .all() as Array<{
        period: string;
        type: string;
        summary: string;
        key_decisions: string;
        patterns: string;
        session_count: number;
      }>;

      for (const d of digests) {
        if (!d.period) continue;

        const patterns: string[] = safeParseJson(d.patterns);
        const content = [
          `${d.type} digest: ${d.period}`,
          d.summary ? `Summary: ${d.summary}` : '',
          patterns.length > 0 ? `Patterns: ${patterns.join(', ')}` : '',
          `Sessions: ${d.session_count}`,
        ]
          .filter(Boolean)
          .join('\n');

        const key = `digest.${d.type}.${d.period}`;
        const existing = db.findByKey(key);
        if (existing) continue;

        db.upsertMemory({
          key,
          projectPath: cwd,
          type: 'note',
          content,
          importance: 0.65,
          confidence: 0.7,
        });

        db.logEvent({
          memoryId: db.findByKey(key)!.id,
          event: 'digest_imported',
          note: `${d.type} ${d.period} (${d.session_count} sessions)`,
        });

        result.digestsImported++;
      }
    } catch (e) {
      result.errors.push(`Digest migration: ${e}`);
    }

    // ── Migrate topic_index ───────────────────────────────────
    try {
      const topics = oldDb.prepare('SELECT topic, session_id FROM topic_index ORDER BY topic').all() as Array<{
        topic: string;
        session_id: string;
      }>;

      // Group by topic
      const topicMap = new Map<string, string[]>();
      for (const t of topics) {
        if (!t.topic) continue;
        const list = topicMap.get(t.topic) ?? [];
        list.push(t.session_id);
        topicMap.set(t.topic, list);
      }

      for (const [topic, sessionIds] of topicMap) {
        const key = `topic.${topic.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
        const existing = db.findByKey(key);
        if (existing) continue;

        db.upsertMemory({
          key,
          projectPath: cwd,
          type: 'reference',
          content: `Topic: ${topic} (${sessionIds.length} sessions)`,
          importance: 0.5,
          confidence: 0.5,
        });
      }
    } catch (e) {
      result.errors.push(`Topic migration: ${e}`);
    }
  } catch (e) {
    result.errors.push(`DB open: ${e}`);
  } finally {
    oldDb?.close();
  }

  return result;
}

function safeParseJson(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
