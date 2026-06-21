/**
 * Distill Process — extract reusable patterns from MemoryDB (30-day cycle).
 *
 * Runs every 30 days on first session of the day:
 * 1. Queries MemoryDB for recent memories and timeline events
 * 2. Identifies recurring patterns (types, themes, frequency)
 * 3. Creates "experience" records with consolidated knowledge
 * 4. Generates reusable skill suggestions
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MemoryDB } from '../../memory/database.js';
import { getClewConfigHomeDir } from '../../utils/envUtils.js';
import { pathExists } from '../../utils/file.js';

const DISTILL_STATE_FILE = 'distill-state.json';
const DISTILL_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface DistillState {
  lastDistillAt: number;
  distillsRun: number;
  lastMonthProcessed: string;
}

interface Pattern {
  type: 'file' | 'tool' | 'category' | 'memory_type';
  value: string;
  frequency: number;
  example: string;
}

interface Experience {
  id: string;
  month: string;
  patterns: Pattern[];
  reusableSkills: string[];
  createdAt: number;
}

function getDistillStatePath(projectRoot: string): string {
  const dir = join(getClewConfigHomeDir(), 'projects', sanitize(projectRoot));
  return join(dir, DISTILL_STATE_FILE);
}

function getExperiencesPath(projectRoot: string): string {
  const dir = join(getClewConfigHomeDir(), 'projects', sanitize(projectRoot));
  return join(dir, 'experiences.json');
}

function sanitize(p: string): string {
  return p.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+|_+$/g, '');
}

async function loadDistillState(projectRoot: string): Promise<DistillState | null> {
  const path = getDistillStatePath(projectRoot);
  if (!(await pathExists(path))) return null;
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as DistillState;
  } catch {
    return null;
  }
}

async function saveDistillState(projectRoot: string, state: DistillState): Promise<void> {
  const path = getDistillStatePath(projectRoot);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf-8');
}

async function loadExperiences(projectRoot: string): Promise<Experience[]> {
  const path = getExperiencesPath(projectRoot);
  if (!(await pathExists(path))) return [];
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as Experience[];
  } catch {
    return [];
  }
}

async function saveExperiences(projectRoot: string, experiences: Experience[]): Promise<void> {
  const path = getExperiencesPath(projectRoot);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(experiences, null, 2), 'utf-8');
}

/**
 * Extract patterns from MemoryDB memories.
 */
function extractPatterns(memories: { type: string; content: string; importance: number; key: string }[]): Pattern[] {
  const typeCounts = new Map<string, number>();
  const themeCounts = new Map<string, { count: number; example: string }>();

  for (const mem of memories) {
    // Count by memory type
    typeCounts.set(mem.type, (typeCounts.get(mem.type) ?? 0) + 1);

    // Extract theme words (nouns/keywords from content)
    const words = mem.content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 4 && !['the', 'this', 'that', 'with', 'from', 'have', 'been', 'were'].includes(w));

    const themes = new Set(words.slice(0, 5));
    for (const theme of themes) {
      const existing = themeCounts.get(theme);
      if (existing) {
        existing.count++;
      } else {
        themeCounts.set(theme, { count: 1, example: mem.content.slice(0, 80) });
      }
    }
  }

  const patterns: Pattern[] = [];

  // Patterns from memory types
  for (const [type, count] of typeCounts) {
    if (count >= 2) {
      patterns.push({
        type: 'memory_type',
        value: `${type} memories`,
        frequency: count,
        example: `${count} memories of type '${type}' recorded this period`,
      });
    }
  }

  // Patterns from recurring themes
  for (const [theme, data] of themeCounts) {
    if (data.count >= 2) {
      patterns.push({
        type: 'category' as const,
        value: `Theme: ${theme}`,
        frequency: data.count,
        example: data.example,
      });
    }
  }

  return patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 10);
}

/**
 * Generate reusable skill suggestions from patterns.
 */
function generateSkillSuggestions(patterns: Pattern[]): string[] {
  const suggestions: string[] = [];

  const memoryTypes = patterns.filter(p => p.type === 'memory_type');
  if (memoryTypes.length >= 2) {
    suggestions.push('Multiple memory types in use — consider reviewing memory organization');
  }

  const themes = patterns.filter(p => p.type === 'category');
  if (themes.length >= 3) {
    suggestions.push('Recurring themes detected — consider documenting common workflows');
  }

  if (patterns.length >= 5) {
    suggestions.push('High pattern density — consider creating custom skills for frequent tasks');
  }

  return suggestions;
}

/**
 * Query MemoryDB for recent memory activity.
 */
function queryMemoryDBRecent(months: number): { type: string; content: string; importance: number; key: string }[] {
  if (!MemoryDB.isInitialized()) return [];

  try {
    const db = MemoryDB.getInstance();
    const cutoff = Date.now() - months * 30 * 24 * 60 * 60 * 1000;

    const stmt = db.prepare(`
      SELECT type, content, importance, key FROM memories
      WHERE created_at >= ? OR last_accessed_at >= ?
      ORDER BY importance DESC LIMIT 200
    `);
    return stmt.all(cutoff, cutoff) as { type: string; content: string; importance: number; key: string }[];
  } catch {
    return [];
  }
}

/**
 * Check if distill should run and execute if so.
 * Called at session start — lightweight check.
 */
export async function autoDistill(projectRoot: string): Promise<boolean> {
  const state = await loadDistillState(projectRoot);
  const now = Date.now();

  // Run if never run before, or if 30+ days since last distill
  if (state && now - state.lastDistillAt < DISTILL_INTERVAL_MS) {
    return false;
  }

  // Query MemoryDB for recent memories
  const memories = queryMemoryDBRecent(1);
  if (memories.length < 3) return false; // Not enough data

  // Extract patterns
  const patterns = extractPatterns(memories);
  if (patterns.length === 0) return false;

  // Generate skill suggestions
  const reusableSkills = generateSkillSuggestions(patterns);

  // Save as experience
  const experiences = await loadExperiences(projectRoot);
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const experience: Experience = {
    id: `exp-${month}-${Date.now()}`,
    month,
    patterns,
    reusableSkills,
    createdAt: now,
  };
  experiences.push(experience);

  // Keep only last 12 months of experiences
  const cutoff = now - 12 * 30 * 24 * 60 * 60 * 1000;
  const filtered = experiences.filter(e => e.createdAt > cutoff);
  await saveExperiences(projectRoot, filtered);

  // Save distill state
  const newState: DistillState = {
    lastDistillAt: now,
    distillsRun: (state?.distillsRun ?? 0) + 1,
    lastMonthProcessed: month,
  };
  await saveDistillState(projectRoot, newState);

  return true;
}

/**
 * Get distill status for display.
 */
export async function getDistillStatus(projectRoot: string): Promise<{
  lastDistillAt: number | null;
  distillsRun: number;
  nextDistillIn: number; // ms until next distill
  experiencesCount: number;
} | null> {
  const state = await loadDistillState(projectRoot);
  const experiences = await loadExperiences(projectRoot);

  if (!state) {
    return {
      lastDistillAt: null,
      distillsRun: 0,
      nextDistillIn: DISTILL_INTERVAL_MS,
      experiencesCount: experiences.length,
    };
  }

  const elapsed = Date.now() - state.lastDistillAt;
  const nextDistillIn = Math.max(0, DISTILL_INTERVAL_MS - elapsed);

  return {
    lastDistillAt: state.lastDistillAt,
    distillsRun: state.distillsRun,
    nextDistillIn,
    experiencesCount: experiences.length,
  };
}
