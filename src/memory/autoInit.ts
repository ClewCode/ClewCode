/**
 * AutoInit — lazy memory system initialization.
 *
 * Called on first system prompt build. Automatically:
 * 1. Creates .clew/memory/ directory + DB if missing
 * 2. Runs scan if memories table is empty
 * Safe to call multiple times — skips if already initialized.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCwd } from '../utils/cwd.js';
import { MemoryDB } from './database.js';
import { getMemoryDbPath, initMemoryHierarchy } from './hierarchy.js';
import { scanRepo } from './scanner.js';

let initialized = false;

/**
 * Lazy init: call before any memory operation.
 * Returns true if memory system is available.
 */
export async function ensureMemorySystem(): Promise<boolean> {
  if (initialized && MemoryDB.isInitialized()) return true;

  const cwd = getCwd();
  const dbPath = getMemoryDbPath();

  // Check if .clew/ exists at all — skip if not a clew project
  if (!existsSync(join(cwd, '.clew'))) {
    return false;
  }

  try {
    await initMemoryHierarchy();
    if (!MemoryDB.isInitialized()) {
      MemoryDB.init(dbPath);
    }

    // Auto-scan if empty
    const stats = MemoryDB.getInstance().getStats();
    if (stats.total === 0) {
      await scanRepo();
    } else {
      // Maintenance: drop stale low-value memories once per session
      try {
        MemoryDB.getInstance().pruneMemories();
      } catch {
        // Non-fatal — pruning is advisory
      }
    }

    initialized = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset initialized flag (for testing).
 */
export function resetAutoInit(): void {
  initialized = false;
}
