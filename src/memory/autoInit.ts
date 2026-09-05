/**
 * AutoInit — filesystem memory system initialization.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCwd } from '../utils/cwd.js';
import { MemoryDB } from './database.js';
import { getMemoryDirPath, initMemoryHierarchy } from './hierarchy.js';
import { scanRepo } from './scanner.js';

let initialized = false;

export async function ensureMemorySystem(): Promise<boolean> {
  if (initialized && MemoryDB.isInitialized()) return true;

  const cwd = getCwd();
  if (!existsSync(join(cwd, '.clew'))) return false;

  try {
    await initMemoryHierarchy();
    if (!MemoryDB.isInitialized()) {
      MemoryDB.init(getMemoryDirPath());
    }
    const stats = MemoryDB.getInstance().getStats();
    if (stats.total === 0) {
      await scanRepo();
    } else {
      try {
        MemoryDB.getInstance().pruneMemories();
      } catch {
        // Startup pruning is best-effort; memory initialization must continue.
      }
    }
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

export function resetAutoInit(): void {
  initialized = false;
}
