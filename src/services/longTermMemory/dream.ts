/**
 * Dream Process — automated memory consolidation (7-day cycle).
 *
 * Wraps existing consolidation infrastructure with cron scheduling:
 * - Groups sessions from the past week
 * - Merges duplicate insights
 * - Deduplicates topic_index entries
 * - Creates weekly digest with patterns noticed
 * - Prunes low-value session records
 *
 * Runs automatically on first session of each day, checking if 7+ days
 * have passed since last consolidation.
 */

import { join } from 'node:path';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';
import { pathExists } from '../../utils/file.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getConsolidationCandidates, saveConsolidatedDigest } from './consolidate.js';

const DREAM_STATE_FILE = 'dream-state.json';
const DREAM_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface DreamState {
  lastDreamAt: number;
  dreamsRun: number;
  lastPeriodConsolidated: string;
}

function getDreamStatePath(projectRoot: string): string {
  const dir = join(getClaudeConfigHomeDir(), 'projects', sanitize(projectRoot));
  return join(dir, DREAM_STATE_FILE);
}

function sanitize(p: string): string {
  return p.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+|_+$/g, '');
}

async function loadDreamState(projectRoot: string): Promise<DreamState | null> {
  const path = getDreamStatePath(projectRoot);
  if (!(await pathExists(path))) return null;
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as DreamState;
  } catch {
    return null;
  }
}

async function saveDreamState(projectRoot: string, state: DreamState): Promise<void> {
  const path = getDreamStatePath(projectRoot);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Check if dream should run and execute if so.
 * Called at session start — lightweight check, no-ops if not time yet.
 */
export async function autoDream(projectRoot: string): Promise<boolean> {
  const state = await loadDreamState(projectRoot);
  const now = Date.now();

  // Run if never run before, or if 7+ days since last dream
  if (state && now - state.lastDreamAt < DREAM_INTERVAL_MS) {
    return false;
  }

  // Get consolidation candidates (sessions >7 days old)
  const candidates = getConsolidationCandidates(projectRoot);
  if (candidates.length === 0) return false;

  // Consolidate each week's sessions
  for (const { week, sessions, total } of candidates) {
    if (total === 0) continue;

    // Build a summary from session data
    const summaries = sessions.map(s => s.summary).filter(Boolean);
    const allDecisions = sessions.flatMap(s => {
      try { return JSON.parse(s.key_decisions) as string[]; } catch { return []; }
    });
    const allFiles = sessions.flatMap(s => {
      try { return JSON.parse(s.active_files) as string[]; } catch { return []; }
    });

    const consolidatedSummary = [
      `Week ${week}: ${total} sessions`,
      '',
      'Summaries:',
      ...summaries.map(s => `- ${s}`),
      '',
      'Key decisions:',
      ...allDecisions.slice(0, 10).map(d => `- ${d}`),
    ].join('\n');

    // Extract patterns from repeated files
    const fileCounts = new Map<string, number>();
    for (const f of allFiles) {
      fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
    }
    const patterns = Array.from(fileCounts.entries())
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([file, count]) => `Frequently modified: ${file} (${count}x)`);

    const sessionIds = sessions.map(s => s.session_id);
    saveConsolidatedDigest(projectRoot, week, 'weekly', consolidatedSummary, patterns, sessionIds);
  }

  // Save dream state
  const newState: DreamState = {
    lastDreamAt: now,
    dreamsRun: (state?.dreamsRun ?? 0) + 1,
    lastPeriodConsolidated: candidates[candidates.length - 1]?.week ?? '',
  };
  await saveDreamState(projectRoot, newState);

  return true;
}

/**
 * Get dream status for display.
 */
export async function getDreamStatus(projectRoot: string): Promise<{
  lastDreamAt: number | null;
  dreamsRun: number;
  nextDreamIn: number; // ms until next dream
  pendingConsolidations: number;
} | null> {
  const state = await loadDreamState(projectRoot);
  const candidates = getConsolidationCandidates(projectRoot);
  const pendingConsolidations = candidates.reduce((sum, c) => sum + c.total, 0);

  if (!state) {
    return {
      lastDreamAt: null,
      dreamsRun: 0,
      nextDreamIn: pendingConsolidations > 0 ? 0 : DREAM_INTERVAL_MS,
      pendingConsolidations,
    };
  }

  const elapsed = Date.now() - state.lastDreamAt;
  const nextDreamIn = Math.max(0, DREAM_INTERVAL_MS - elapsed);

  return {
    lastDreamAt: state.lastDreamAt,
    dreamsRun: state.dreamsRun,
    nextDreamIn,
    pendingConsolidations,
  };
}
