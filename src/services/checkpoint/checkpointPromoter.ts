/**
 * Checkpoint → Project Memory Promotion.
 *
 * After the 70% checkpoint is written, promote stable information from session
 * checkpoints into project-level MEMORY.md. This creates the "project memory"
 * layer — knowledge that persists across sessions for the same project.
 *
 * What gets promoted:
 * - Repeatedly modified files (appeared in 2+ checkpoints) → "active files"
 * - Decisions that persisted → "architecture decisions"
 * - Notes from scratchpad → "session notes"
 *
 * Uses the existing memdir infrastructure (getAutoMemEntrypoint) to find
 * MEMORY.md and appends timestamped entries. Fire-and-forget safe.
 */

import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getAutoMemEntrypoint, getAutoMemPath } from '../../memdir/paths.js';
import { logError } from '../../utils/log.js';
import { loadCheckpoints } from './checkpointWriter.js';

/**
 * Promote checkpoint info to MEMORY.md.
 * Call after the 70% checkpoint is written (fire-and-forget).
 */
export async function promoteCheckpoints(goalText: string): Promise<void> {
  try {
    const checkpoints = await loadCheckpoints();
    if (checkpoints.length < 2) return; // need at least 2 checkpoints to detect patterns

    const entrypoint = getAutoMemEntrypoint();
    const memDir = getAutoMemPath();
    await ensureDir(join(memDir, '.')); // ensure parent exists

    const entries = buildPromotionEntries(goalText, checkpoints);
    if (!entries) return;

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const header = `\n## Session — ${timestamp}\n\n`;
    const body = entries.map(e => `- ${e}`).join('\n');

    await appendFile(entrypoint, `${header + body}\n`, 'utf-8');
  } catch {
    // Promotion failure is non-fatal
  }
}

function buildPromotionEntries(
  goalText: string,
  checkpoints: import('./checkpointWriter.js').TaskCheckpoint[],
): string[] | null {
  const entries: string[] = [];

  // Goal context
  entries.push(`Goal: ${goalText}`);
  entries.push(`Progress: ${Math.max(...checkpoints.map(c => c.progressPercent))}%`);
  entries.push(`Checkpoints written: ${checkpoints.length}`);

  // Detect repeatedly modified files (appeared in 2+ checkpoints)
  const fileCounts = new Map<string, number>();
  for (const cp of checkpoints) {
    for (const f of cp.filesModified) {
      fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
    }
  }
  const activeFiles = Array.from(fileCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([f]) => f);
  if (activeFiles.length > 0) {
    entries.push(`Active files: ${activeFiles.join(', ')}`);
  }

  // Key decisions (from latest checkpoint)
  const latest = checkpoints[checkpoints.length - 1]!;
  if (latest.decisions.length > 0) {
    entries.push('Decisions:', ...latest.decisions.slice(0, 5).map(d => `  - ${d}`));
  }

  // Notes from scratchpad
  if (latest.notes) {
    const noteLines = latest.notes
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (noteLines.length > 0) {
      entries.push('Notes:', ...noteLines.map(l => `  - ${l}`));
    }
  }

  return entries.length > 1 ? entries : null;
}

async function ensureDir(dir: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true }).catch(err => {
    logError(err);
  });
}
