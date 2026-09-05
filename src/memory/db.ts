/**
 * Memory DB compat layer — filesystem now, no SQLite.
 * Kept for import compatibility. Ingest/search now read markdown files directly.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { getFsImplementation } from '../utils/fsOperations.js';

export function getMemoryDb(cwd: string): { cwd: string } {
  const fsImpl = getFsImplementation();
  const indexDir = join(cwd, DOT_CLEW, 'index');
  if (!existsSync(indexDir)) mkdirSync(indexDir, { recursive: true });
  // Return stub — callers should migrate to filesystem scan
  void fsImpl;
  return { cwd };
}

export function closeMemoryDb(): void {
  // Filesystem-backed memory has no persistent database handle to close.
}
