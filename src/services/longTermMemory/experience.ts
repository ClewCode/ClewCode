/**
 * Experience Layer — "ยิ่งใช้ยิ่งเก่ง" self-improving memory.
 *
 * Like Hermes agent: memories gain weight through usage, patterns emerge,
 * and the system learns what matters without explicit configuration.
 *
 * Concepts:
 * - Access count → weight (more access = more important)
 * - Recency + frequency → relevance score
 * - Pattern detection → recurring topics get special treatment
 * - Cold memories → auto-archive to keep graph lean
 * - Confidence → user corrections improve accuracy
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';

function getDb(projectRoot: string): Database {
  const dir = join(getClaudeConfigHomeDir(), 'projects', sanitize(projectRoot));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, 'knowledge-graph.db'), { create: true });
  db.run('PRAGMA journal_mode = WAL');
  return db;
}

function sanitize(p: string): string {
  return p.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+|_+$/g, '');
}

// ── XP System ──

interface NodeXP {
  id: string;
  type: string;
  xp: number; // total experience points
  level: number; // derived from xp
  streak: number; // consecutive days accessed
  last_access: number;
  created_at: number;
}

/**
 * Award XP to a node. More frequent access = faster leveling.
 */
export function awardNodeXP(projectRoot: string, nodeId: string, _amount = 10): NodeXP | null {
  const db = getDb(projectRoot);
  const now = Date.now();

  const existing = db.prepare('SELECT access_count, updated_at, created_at FROM nodes WHERE id = ?').get(nodeId) as
    | { access_count: number; updated_at: number; created_at: number }
    | undefined;

  if (!existing) {
    db.close();
    return null;
  }

  const newCount = existing.access_count + 1;
  const lastAccess = new Date(existing.updated_at);
  const today = new Date(now);
  const wasYesterday = lastAccess.getDate() !== today.getDate() || lastAccess.getMonth() !== today.getMonth();
  const streak = wasYesterday ? 1 : Math.max(1, Math.floor((now - existing.updated_at) / 86_400_000));

  db.prepare('UPDATE nodes SET access_count = ?, updated_at = ? WHERE id = ?').run(newCount, now, nodeId);

  // Edge weight boost
  db.prepare(`UPDATE edges SET weight = weight + 0.1 WHERE source_id = ? OR target_id = ?`).run(nodeId, nodeId);

  const xp = newCount * 10 + (streak > 3 ? streak * 5 : 0); // streak bonus
  const level = Math.floor(xp / 100) + 1;

  db.close();
  return { id: nodeId, type: '', xp, level, streak, last_access: now, created_at: existing.created_at };
}

/**
 * Get top nodes by XP — "what does this system know best?"
 */
export function getTopNodes(
  projectRoot: string,
  limit = 10,
): Array<{ type: string; name: string; access_count: number }> {
  const db = getDb(projectRoot);
  const rows = db
    .prepare(`
    SELECT type, name, access_count FROM nodes
    ORDER BY access_count DESC LIMIT ?
  `)
    .all(limit) as Array<{ type: string; name: string; access_count: number }>;
  db.close();
  return rows;
}

/**
 * Get cold nodes — unused for a long time, candidates for archival.
 */
export function getColdNodes(
  projectRoot: string,
  thresholdDays = 30,
): Array<{ type: string; name: string; days: number }> {
  const db = getDb(projectRoot);
  const cutoff = Date.now() - thresholdDays * 86_400_000;
  const rows = db
    .prepare(`
    SELECT type, name, CAST((? - updated_at) / 86400000 AS INTEGER) as days
    FROM nodes WHERE updated_at < ? AND type = 'tag'
    ORDER BY updated_at ASC LIMIT 10
  `)
    .all(Date.now(), cutoff) as Array<{ type: string; name: string; days: number }>;
  db.close();
  return rows;
}

// ── Learning from Corrections ──

/**
 * When user corrects a memory, decrease confidence on old + increase on new.
 */
export function applyCorrection(projectRoot: string, oldNodeId: string, newNodeId: string): void {
  const db = getDb(projectRoot);

  // Decrease old
  db.prepare('UPDATE nodes SET access_count = MAX(0, access_count - 1) WHERE id = ?').run(oldNodeId);
  db.prepare('UPDATE edges SET weight = MAX(0, weight - 0.5) WHERE source_id = ? OR target_id = ?').run(
    oldNodeId,
    oldNodeId,
  );

  // Increase new
  db.prepare('UPDATE nodes SET access_count = access_count + 2, updated_at = ? WHERE id = ?').run(
    Date.now(),
    newNodeId,
  );
  db.prepare('UPDATE edges SET weight = weight + 0.5 WHERE source_id = ? OR target_id = ?').run(newNodeId, newNodeId);

  db.close();
}

// ── Skill/Expertise Tracking ──

/**
 * What topics is the user most experienced in?
 * (based on tag access frequency)
 */
export function getExpertiseProfile(projectRoot: string): Array<{ topic: string; level: number; sessions: number }> {
  const db = getDb(projectRoot);
  const rows = db
    .prepare(`
    SELECT n.name as topic,
           CAST(n.access_count / 10 + 1 AS INTEGER) as level,
           COUNT(DISTINCT e.source_id) as sessions
    FROM nodes n
    JOIN edges e ON e.target_id = n.id AND e.type = 'has_tag'
    WHERE n.type = 'tag'
    GROUP BY n.id
    ORDER BY n.access_count DESC
    LIMIT 8
  `)
    .all() as Array<{ topic: string; level: number; sessions: number }>;
  db.close();
  return rows;
}

/**
 * Experience report — "what has the system learned?"
 */
export function getExperienceReport(projectRoot: string): string {
  const db = getDb(projectRoot);

  const totalSessions = (db.prepare('SELECT COUNT(*) as c FROM nodes WHERE type = ?').get('session') as { c: number })
    .c;
  const totalDecisions = (db.prepare('SELECT COUNT(*) as c FROM nodes WHERE type = ?').get('decision') as { c: number })
    .c;
  const topTags = getTopNodes(projectRoot, 6);
  const expertise = getExpertiseProfile(projectRoot);

  db.close();

  const lines: string[] = [
    '## Experience Report',
    '',
    `📊 ${totalSessions} sessions · ${totalDecisions} decisions learned`,
    '',
    '### Most-Accessed Topics',
    ...topTags.map(t => `  🏷️ ${t.name} (${t.access_count}x)`),
    '',
    '### Expertise Profile',
    ...expertise.map(e => `  ${xpBar(e.level)} ${e.topic} — Lv.${e.level} (${e.sessions} sessions)`),
    '',
    '### Progress',
    ...getProgressMilestones(totalSessions, totalDecisions),
  ];

  return lines.join('\n');
}

function xpBar(level: number): string {
  const max = 10;
  const filled = '█'.repeat(Math.min(level, max));
  const empty = '░'.repeat(Math.max(0, max - level));
  return `${filled}${empty}`;
}

function getProgressMilestones(sessions: number, decisions: number): string[] {
  const ms: string[] = [];

  if (sessions < 5) ms.push('  🌱 Getting started — building initial context');
  else if (sessions < 20) ms.push('  🌿 Growing — patterns emerging');
  else if (sessions < 50) ms.push('  🌳 Established — rich context available');
  else ms.push('  🏛️ Veteran — deep institutional knowledge');

  if (decisions > 10) ms.push('  ⚡ Decision patterns detected — recommendations available');
  if (sessions > 10) ms.push('  🧠 Weekly digests active — old memories consolidated');

  return ms;
}
