/**
 * Distill Process — extract reusable patterns from monthly digests (30-day cycle).
 *
 * Runs every 30 days on first session of the day:
 * 1. Analyzes weekly digests for the month
 * 2. Identifies recurring patterns (file types, tool usage, problem categories)
 * 3. Creates "experience" records with higher XP weight
 * 4. Generates reusable skill suggestions
 *
 * Builds on existing consolidation and experience infrastructure.
 */

import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';
import { pathExists } from '../../utils/file.js';

const DISTILL_STATE_FILE = 'distill-state.json';
const DISTILL_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface DistillState {
  lastDistillAt: number;
  distillsRun: number;
  lastMonthProcessed: string;
}

interface Pattern {
  type: 'file' | 'tool' | 'category';
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
  const dir = join(getClaudeConfigHomeDir(), 'projects', sanitize(projectRoot));
  return join(dir, DISTILL_STATE_FILE);
}

function getExperiencesPath(projectRoot: string): string {
  const dir = join(getClaudeConfigHomeDir(), 'projects', sanitize(projectRoot));
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
 * Extract patterns from a set of session digests.
 */
function extractPatterns(
  digests: { summary: string; patterns: string[] }[],
): Pattern[] {
  const patternCounts = new Map<string, { count: number; example: string }>();

  for (const digest of digests) {
    for (const pattern of digest.patterns) {
      const existing = patternCounts.get(pattern);
      if (existing) {
        existing.count++;
      } else {
        patternCounts.set(pattern, { count: 1, example: digest.summary.slice(0, 100) });
      }
    }
  }

  return Array.from(patternCounts.entries())
    .filter(([, data]) => data.count >= 2) // Appears in at least 2 digests
    .map(([value, data]) => ({
      type: 'category' as const,
      value,
      frequency: data.count,
      example: data.example,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);
}

/**
 * Generate reusable skill suggestions from patterns.
 */
function generateSkillSuggestions(patterns: Pattern[]): string[] {
  const suggestions: string[] = [];

  // Pattern: frequently modified files → suggest checking for related patterns
  const frequentFiles = patterns.filter(p => p.value.includes('Frequently modified'));
  if (frequentFiles.length >= 2) {
    suggestions.push('Consider grouping related file modifications into atomic commits');
  }

  // Pattern: repeated tool usage → suggest automation
  const toolPatterns = patterns.filter(p => p.value.includes('tool'));
  if (toolPatterns.length >= 3) {
    suggestions.push('Frequent tool patterns detected — consider creating a custom skill');
  }

  // Pattern: recurring problem categories → suggest documentation
  if (patterns.length >= 5) {
    suggestions.push('Multiple recurring patterns — consider documenting common workflows');
  }

  return suggestions;
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

  // Load recent digests (past month)
  const digests = await loadRecentDigests(projectRoot);
  if (digests.length === 0) return false;

  // Extract patterns
  const patterns = extractPatterns(digests);
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
 * Load digests from the past month.
 */
async function loadRecentDigests(
  projectRoot: string,
): Promise<{ summary: string; patterns: string[] }[]> {
  // Simplified: load from digests directory if it exists
  // In a full implementation, this would query the SQLite database
  const dir = join(getClaudeConfigHomeDir(), 'projects', sanitize(projectRoot), 'digests');
  if (!(await pathExists(dir))) return [];

  const digests: { summary: string; patterns: string[] }[] = [];
  const files = await import('node:fs/promises').then(fs => fs.readdir(dir));

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(dir, file), 'utf-8');
      const data = JSON.parse(raw);
      if (data.summary && Array.isArray(data.patterns)) {
        digests.push(data);
      }
    } catch {
      // Skip corrupted files
    }
  }

  return digests;
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
