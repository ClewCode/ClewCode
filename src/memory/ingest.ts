/**
 * Ingest — filesystem-only, no SQLite.
 * Scans markdown files and reportscounts; indexing is ephemeral (scan on demand).
 */

import { getFsImplementation } from '../utils/fsOperations.js';
import type { ClaudeMemoryConfig } from './config.js';
import { scanDirectory } from './loader.js';

export interface IngestResult {
  scannedCount: number;
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
  totalChunks: number;
}

export async function ingestMemoryWorkspace(cwd: string, config: ClaudeMemoryConfig): Promise<IngestResult> {
  void getFsImplementation();
  const scannedDocs = await scanDirectory(config.memoryDir, config.rootDir, 'project', config.excludeGlobs);
  // No DB: just count markdown files, chunks = 1 per doc (no actual chunking needed for filesystem SoT)
  return {
    scannedCount: scannedDocs.length,
    addedCount: scannedDocs.length,
    updatedCount: 0,
    deletedCount: 0,
    totalChunks: scannedDocs.length,
  };
}
