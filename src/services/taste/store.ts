/**
 * Taste store — learned preferences about how the user wants to be worked with.
 *
 * Taste is deliberately narrower than memory. A memory records a fact ("the
 * user is a data scientist"); a taste records a *standing preference in how to
 * respond* ("communicates in Thai for brief reactions", "wants terse answers
 * with no trailing summary"). Memories inform what you know; taste informs how
 * you behave, so it is injected on every turn rather than recalled on demand.
 *
 * Two scopes, two files:
 *   project — `<projectRoot>/.clew/memory/TASTE.md`, the file the manual
 *             `preferred` feedback signal already writes to. Conventions that
 *             belong to this repo.
 *   global  — `<memoryBaseDir>/memory/TASTE.md`. Language, tone, response
 *             shape — things true of the user everywhere.
 *
 * On-disk line format, chosen so the existing hand-written entries keep
 * parsing and a human can still edit the file directly:
 *
 *   - [2026-08-04] (80%) Communicates in Thai for brief messages
 *
 * The confidence marker is optional; a line without one reads as 100% (a
 * human wrote it, so it is not a guess).
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getMemoryBaseDir } from '../../memdir/paths.js';
import { getMemoryDirPath } from '../../memory/hierarchy.js';

export type TasteScope = 'global' | 'project';

/** Domain buckets that mirror the `.commandcode/taste/` package layout. */
export const TASTE_CATEGORIES = ['cli', 'typescript', 'architecture', 'general'] as const;
export type TasteCategory = (typeof TASTE_CATEGORIES)[number];
export const DEFAULT_TASTE_CATEGORY: TasteCategory = 'general';

export type TasteEntry = {
  /** Stable within a file: scope + category + the entry text. */
  id: string;
  scope: TasteScope;
  category: TasteCategory;
  /** ISO date (YYYY-MM-DD) the entry was learned. */
  date: string;
  /** 0–1. Entries without an explicit marker are 1 (hand-written). */
  confidence: number;
  text: string;
};

const TASTE_FILENAME = 'TASTE.md';
const TASTE_HEADER = '# Coding Style & Preferences\n';

/**
 * `- [2026-08-04] (80%) text` — confidence optional, date required.
 *
 * The date is what separates an entry from prose. TASTE.md is also written by
 * a repo-scan that emits `## Language` / `- JavaScript` documentation bullets;
 * without the date requirement those get read as standing preferences and
 * injected into every turn. Both real writers (the manual `preferred` feedback
 * signal and the extraction fork) stamp a date, so requiring it costs nothing.
 */
const KNOWN_CATEGORIES = new Set(TASTE_CATEGORIES);

/**
 * `- [2026-08-04] (80%) [cli] text` — confidence and category both optional.
 * The category bracket must come before the text; entries without one are
 * backward-compatible and fall back to `general`.
 */
const ENTRY_PATTERN = /^-\s*\[(\d{4}-\d{2}-\d{2})\]\s*(?:\((\d{1,3})%\)\s*)?(?:\[(\w+)\]\s*)?(.+?)\s*$/;

export function getTastePath(scope: TasteScope): string {
  if (scope === 'global') {
    return join(getMemoryBaseDir(), 'memory', TASTE_FILENAME);
  }
  return join(getMemoryDirPath(), TASTE_FILENAME);
}

/** Both taste files, project first — project entries are the more specific ones. */
export function getTastePaths(): string[] {
  return [getTastePath('project'), getTastePath('global')];
}

export function parseTasteFile(content: string, scope: TasteScope): TasteEntry[] {
  const entries: TasteEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    const match = ENTRY_PATTERN.exec(trimmed);
    if (!match) continue;
    const [, date, confidenceRaw, categoryRaw, text] = match;
    if (!text) continue;
    const category = (
      categoryRaw && KNOWN_CATEGORIES.has(categoryRaw as TasteCategory) ? categoryRaw : DEFAULT_TASTE_CATEGORY
    ) as TasteCategory;
    entries.push({
      id: `${scope}:${category}:${text}`,
      scope,
      category,
      date: date ?? '',
      // A hand-written line carries no marker and is not a guess, so it reads
      // as certain rather than as an unknown to be defaulted low.
      confidence: confidenceRaw === undefined ? 1 : clampConfidence(Number(confidenceRaw) / 100),
      text,
    });
  }
  return entries;
}

export function formatTasteEntry(entry: Pick<TasteEntry, 'date' | 'confidence' | 'text' | 'category'>): string {
  const date = entry.date ? `[${entry.date}] ` : '';
  const confidence = entry.confidence >= 1 ? '' : `(${Math.round(entry.confidence * 100)}%) `;
  const category = entry.category && entry.category !== DEFAULT_TASTE_CATEGORY ? `[${entry.category}] ` : '';
  return `- ${date}${confidence}${category}${entry.text}`;
}

export async function readTaste(scope: TasteScope): Promise<TasteEntry[]> {
  const path = getTastePath(scope);
  if (!existsSync(path)) return [];
  try {
    return parseTasteFile(await readFile(path, 'utf8'), scope);
  } catch {
    // A malformed or unreadable taste file must not break the turn — taste is
    // an enhancement, not a dependency.
    return [];
  }
}

/** Project entries first, then global. */
export async function readAllTaste(): Promise<TasteEntry[]> {
  const [project, global] = await Promise.all([readTaste('project'), readTaste('global')]);
  return [...project, ...global];
}

/**
 * Appends entries that aren't already present. Returns only what was actually
 * written, so callers can report "learned N" without double-counting a
 * preference the agent restated.
 */
export async function appendTaste(
  scope: TasteScope,
  candidates: { text: string; confidence: number; date?: string; category?: TasteCategory }[],
): Promise<TasteEntry[]> {
  if (candidates.length === 0) return [];

  const path = getTastePath(scope);
  const existing = await readTaste(scope);
  const seen = new Set(existing.map(e => normalizeForCompare(e.category, e.text)));

  const added: TasteEntry[] = [];
  const lines: string[] = [];
  for (const candidate of candidates) {
    const text = candidate.text.trim();
    if (!text) continue;
    const category = candidate.category ?? DEFAULT_TASTE_CATEGORY;
    const key = normalizeForCompare(category, text);
    if (seen.has(key)) continue;
    seen.add(key);
    const entry: TasteEntry = {
      id: `${scope}:${category}:${text}`,
      scope,
      category,
      date: candidate.date ?? today(),
      confidence: clampConfidence(candidate.confidence),
      text,
    };
    added.push(entry);
    lines.push(formatTasteEntry(entry));
  }
  if (added.length === 0) return [];

  await mkdir(dirname(path), { recursive: true });
  const prior = existsSync(path) ? await readFile(path, 'utf8') : TASTE_HEADER;
  const separator = prior.endsWith('\n') ? '' : '\n';
  await writeFile(path, `${prior}${separator}${lines.join('\n')}\n`, 'utf8');
  return added;
}

/** Rewrites the file without the matching entry. Returns false if not found. */
export async function removeTaste(scope: TasteScope, text: string, category?: TasteCategory): Promise<boolean> {
  const path = getTastePath(scope);
  if (!existsSync(path)) return false;

  const cat = category ?? DEFAULT_TASTE_CATEGORY;
  const target = normalizeForCompare(cat, text);
  const content = await readFile(path, 'utf8');
  const kept: string[] = [];
  let removed = false;
  for (const line of content.split('\n')) {
    const match = line.trim().startsWith('-') ? ENTRY_PATTERN.exec(line.trim()) : null;
    const matchCategory = (
      match?.[3] && KNOWN_CATEGORIES.has(match[3] as TasteCategory) ? match[3] : DEFAULT_TASTE_CATEGORY
    ) as TasteCategory;
    if (match?.[4] && normalizeForCompare(matchCategory, match[4]) === target) {
      removed = true;
      continue;
    }
    kept.push(line);
  }
  if (!removed) return false;
  await writeFile(path, kept.join('\n'), 'utf8');
  return true;
}

/**
 * Rewrites an entry with a new confidence. Used when the user confirms or
 * rejects a learned taste from the card.
 */
export async function adjustTasteConfidence(
  scope: TasteScope,
  text: string,
  delta: number,
  category?: TasteCategory,
): Promise<number | null> {
  const path = getTastePath(scope);
  if (!existsSync(path)) return null;

  const cat = category ?? DEFAULT_TASTE_CATEGORY;
  const target = normalizeForCompare(cat, text);
  const content = await readFile(path, 'utf8');
  let next: number | null = null;
  const lines = content.split('\n').map(line => {
    const trimmed = line.trim();
    const match = trimmed.startsWith('-') ? ENTRY_PATTERN.exec(trimmed) : null;
    if (!match?.[4]) return line;
    const matchCategory = (
      match[3] && KNOWN_CATEGORIES.has(match[3] as TasteCategory) ? match[3] : DEFAULT_TASTE_CATEGORY
    ) as TasteCategory;
    if (normalizeForCompare(matchCategory, match[4]) !== target) return line;
    const current = match[2] === undefined ? 1 : Number(match[2]) / 100;
    next = clampConfidence(current + delta);
    return formatTasteEntry({ date: match[1] ?? '', confidence: next, text: match[4], category: matchCategory });
  });
  if (next === null) return null;
  await writeFile(path, lines.join('\n'), 'utf8');
  return next;
}

/**
 * Case- and punctuation-insensitive so "Wants terse answers." and "wants terse
 * answers" don't both land in the file. Category is included so the same text
 * in different categories stays distinct.
 */
function normalizeForCompare(category: TasteCategory, text: string): string {
  return `${category}::${text
    .toLowerCase()
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()}`;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Lint result for a single malformed line. */
export type TasteLintError = {
  /** 1-based line number within the file. */
  line: number;
  /** Human-readable description of the problem. */
  message: string;
  /** The offending line content (trimmed). */
  raw: string;
};

/**
 * Core lint logic extracted for testability — operates on raw file content
 * rather than reading from disk.
 */
export function lintTasteContent(content: string): TasteLintError[] {
  const errors: TasteLintError[] = [];
  let i = 0;
  for (const rawLine of content.split('\n')) {
    i++;
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('##')) continue;
    if (!line.startsWith('-')) {
      errors.push({ line: i, message: 'Not a valid entry line', raw: line });
      continue;
    }
    const match = ENTRY_PATTERN.exec(line);
    if (!match) {
      errors.push({
        line: i,
        message: 'Malformed entry — expected `- [date] [(N%)] [category] text`',
        raw: line,
      });
      continue;
    }
    const [, date, confidenceRaw, categoryRaw] = match;
    if (!date) {
      errors.push({ line: i, message: 'Missing date stamp', raw: line });
      continue;
    }
    if (confidenceRaw !== undefined) {
      const pct = Number(confidenceRaw);
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        errors.push({ line: i, message: `Confidence ${pct}% is out of range (0–100)`, raw: line });
      }
    }
    if (categoryRaw !== undefined && !KNOWN_CATEGORIES.has(categoryRaw as TasteCategory)) {
      errors.push({
        line: i,
        message: `Unknown category "${categoryRaw}" — expected one of: ${TASTE_CATEGORIES.join(', ')}`,
        raw: line,
      });
    }
  }
  return errors;
}

/**
 * Validates every line in both taste files. Returns a result per scope so the
 * `/taste lint` command can report which file has issues. Lines that are
 * headers, blank, or valid entries produce no error.
 */
export async function lintTaste(): Promise<Record<TasteScope, TasteLintError[]>> {
  const results: Record<TasteScope, TasteLintError[]> = { global: [], project: [] };
  for (const scope of ['global', 'project'] as TasteScope[]) {
    const path = getTastePath(scope);
    if (!existsSync(path)) continue;
    const content = await readFile(path, 'utf8');
    results[scope] = lintTasteContent(content);
  }
  return results;
}

/**
 * Copies entries from `source` scope into `target` scope, skipping any that
 * already exist (matched by category + text). An optional category filter
 * restricts the copy to a single domain bucket.
 *
 * Returns the entries that were actually copied.
 */
export async function pushTaste(
  source: TasteScope,
  target: TasteScope,
  category?: TasteCategory,
): Promise<TasteEntry[]> {
  if (source === target) return [];

  const sourceEntries = await readTaste(source);
  const filtered = category ? sourceEntries.filter(e => e.category === category) : sourceEntries;
  if (filtered.length === 0) return [];

  return appendTaste(
    target,
    filtered.map(e => ({ text: e.text, confidence: e.confidence, date: e.date, category: e.category })),
  );
}
