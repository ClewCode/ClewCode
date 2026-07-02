/**
 * peerSync — cross-peer memory synchronization.
 *
 * Export side: serves this node's top-ranked memories (used by the
 * PeerServer /peer-memory-export endpoint).
 *
 * Import side: validates records fetched from a peer and merges them into
 * the local MemoryDB under the local project path. Identical content is
 * deduplicated by MemoryDB.saveMemory (reinforces instead of duplicating).
 * Imported memories get a confidence discount — a peer's experience is a
 * hint, not a locally verified fact.
 */

import { getCwd } from '../utils/cwd.js';
import { ensureMemorySystem } from './autoInit.js';
import { MemoryDB, type MemoryRecord } from './database.js';
import { MEMORY_TYPES, type MemoryType } from './schema.js';

/** Confidence multiplier applied to memories learned from a peer. */
const PEER_CONFIDENCE_DISCOUNT = 0.8;
/** Max content length accepted from a peer (defense against oversized payloads). */
const MAX_CONTENT_LENGTH = 4_000;

export interface PeerMemoryExport {
  projectPath: string;
  memories: Array<Pick<MemoryRecord, 'type' | 'content' | 'importance' | 'confidence'>>;
}

export interface PeerSyncResult {
  fetched: number;
  imported: number;
  reinforced: number;
  skipped: number;
}

/**
 * Export this node's top memories for a requesting peer.
 * Throws if the local memory system is unavailable.
 */
export async function exportLocalMemories(limit = 50): Promise<PeerMemoryExport> {
  const ok = await ensureMemorySystem();
  if (!ok || !MemoryDB.isInitialized()) {
    throw new Error('Memory system not available on this peer');
  }
  const memories = MemoryDB.getInstance()
    .exportMemories(limit)
    .map(m => ({ type: m.type, content: m.content, importance: m.importance, confidence: m.confidence }));
  return { projectPath: getCwd(), memories };
}

function isValidRecord(
  r: unknown,
): r is { type: MemoryType; content: string; importance?: number; confidence?: number } {
  if (!r || typeof r !== 'object') return false;
  const rec = r as Record<string, unknown>;
  return (
    typeof rec.type === 'string' &&
    (MEMORY_TYPES as readonly string[]).includes(rec.type) &&
    typeof rec.content === 'string' &&
    rec.content.length > 0 &&
    rec.content.length <= MAX_CONTENT_LENGTH
  );
}

function clamp01(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/**
 * Import memories received from a peer into the local store.
 * Invalid records are skipped, duplicates are reinforced, new ones are
 * created under the local project path with a provenance timeline entry.
 */
export async function importPeerMemories(records: unknown[], fromPeer: string): Promise<PeerSyncResult> {
  const ok = await ensureMemorySystem();
  if (!ok || !MemoryDB.isInitialized()) {
    throw new Error('Local memory system not available');
  }
  return importRecordsInto(MemoryDB.getInstance(), records, fromPeer, getCwd());
}

/** Core import logic — exported for testing with an isolated MemoryDB. */
export function importRecordsInto(
  db: MemoryDB,
  records: unknown[],
  fromPeer: string,
  projectPath: string,
): PeerSyncResult {
  let imported = 0;
  let reinforced = 0;
  let skipped = 0;

  for (const record of records) {
    if (!isValidRecord(record)) {
      skipped++;
      continue;
    }
    const before = db.getStats().total;
    const id = db.saveMemory({
      projectPath,
      type: record.type,
      content: record.content,
      importance: clamp01(record.importance, 0.5),
      confidence: clamp01(record.confidence, 0.5) * PEER_CONFIDENCE_DISCOUNT,
    });
    if (db.getStats().total > before) {
      imported++;
      db.logEvent({ memoryId: id, event: 'synced', note: `imported from peer ${fromPeer}` });
    } else {
      reinforced++;
    }
  }

  return { fetched: records.length, imported, reinforced, skipped };
}
