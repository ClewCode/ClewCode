import { getFsImplementation } from '../utils/fsOperations.js';
import { chunkMarkdown } from './chunker.js';
import type { ClaudeMemoryConfig } from './config.js';
import { getMemoryDb } from './db.js';
import { scanDirectory } from './loader.js';
import { redactSecrets } from './redact.js';
import { deleteSource, getAllSources, getSource, insertChunks, upsertSource } from './store.js';
import type { SourceDocument } from './types.js';

export interface IngestResult {
  scannedCount: number;
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
  totalChunks: number;
}

export async function ingestMemoryWorkspace(cwd: string, config: ClaudeMemoryConfig): Promise<IngestResult> {
  const db = getMemoryDb(cwd);
  const _fsImpl = getFsImplementation();

  const scannedDocs = await scanDirectory(config.memoryDir, config.rootDir, 'project', config.excludeGlobs);

  const activeDocIds = new Set<string>();
  let addedCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;
  let totalChunks = 0;

  for (const doc of scannedDocs) {
    const docId = doc.metadata.id;
    activeDocIds.add(docId);

    const existingSource = getSource(db, docId);
    const contentHash = `${doc.relPath}:${doc.size}:${doc.mtimeMs}`; // Quick robust stat hash

    const needsIndex = !existingSource || existingSource.contentHash !== contentHash;

    if (needsIndex) {
      const redactedContent = redactSecrets(doc.content);

      // Map truth priorities based on taxonomy
      let priority = 50;
      if (doc.metadata.type === 'user') priority = 80;
      else if (doc.metadata.type === 'project') priority = 60;
      else if (doc.metadata.type === 'feedback') priority = 70;

      const sourceDoc: SourceDocument = {
        id: docId,
        sourceType: doc.metadata.type,
        uri: doc.relPath,
        title: doc.metadata.suggested_target || doc.relPath,
        sourcePath: doc.filePath,
        contentHash,
        truthPriority: priority,
        editable: 1,
        createdAt: doc.metadata.created || new Date().toISOString(),
        updatedAt: doc.metadata.updated || new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };

      // 1. Write source
      upsertSource(db, sourceDoc);

      // 2. Chunk & insert
      const chunks = chunkMarkdown(docId, redactedContent, config.maxChunkTokens, priority);
      // Clean old chunks
      db.prepare('DELETE FROM chunks_fts WHERE source_id = ?').run(docId);
      db.prepare('DELETE FROM chunks WHERE source_id = ?').run(docId);
      insertChunks(db, chunks, sourceDoc.title);

      if (existingSource) {
        updatedCount++;
      } else {
        addedCount++;
      }
      totalChunks += chunks.length;
    } else {
      // Just fetch active chunk counts
      const row = db.query('SELECT COUNT(*) as c FROM chunks WHERE source_id = ?').get(docId) as { c: number };
      totalChunks += row ? row.c : 0;
    }
  }

  // Handle deletions: Any sources in DB that are not scanned
  const dbSources = getAllSources(db);
  for (const source of dbSources) {
    // Only delete memory files (editable = 1), not runs or other source types
    if (source.editable === 1 && !activeDocIds.has(source.id)) {
      deleteSource(db, source.id);
      deletedCount++;
    }
  }

  return {
    scannedCount: scannedDocs.length,
    addedCount,
    updatedCount,
    deletedCount,
    totalChunks,
  };
}
