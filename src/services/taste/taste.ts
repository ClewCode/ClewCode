/**
 * Taste — enablement, learning, and the context block applied on every turn.
 *
 * See store.ts for the on-disk format and prompt.ts for how the extraction
 * fork is asked to report what it observed.
 */

import { isAutoMemoryEnabled } from '../../memdir/paths.js';
import { logForDebugging } from '../../utils/debug.js';
import { getInitialSettings } from '../../utils/settings/settings.js';
import { parseTasteBlock, type TasteCandidate } from './prompt.js';
import { appendTaste, readAllTaste, TASTE_CATEGORIES, type TasteEntry, type TasteLintError } from './store.js';

export type { TasteLintError } from './store.js';
// Re-export category helpers so callers can import everything from the service
// barrel rather than reaching into the store directly.
export { pushTaste } from './store.js';

/**
 * Taste rides on the extraction fork and is injected as instructions, so it is
 * off wherever auto-memory is off — otherwise disabling memory would leave a
 * learning loop running that the user thought they had turned off. The setting
 * can still force it off independently.
 */
export function isTasteEnabled(): boolean {
  const setting = getInitialSettings().tasteEnabled;
  if (setting === false) return false;
  if (!isAutoMemoryEnabled()) return false;
  return setting ?? true;
}

/**
 * A preference is only strong enough to steer behavior once it has survived
 * some corroboration. Below this it is still recorded (so the next observation
 * can raise it) but not injected — acting on a weak guess is worse than not
 * having learned it.
 */
export const TASTE_APPLY_THRESHOLD = 0.6;

/**
 * The block injected into the turn. Returns null when there is nothing worth
 * applying, so callers can skip the section entirely rather than inject an
 * empty heading.
 */
export async function buildTasteContext(): Promise<string | null> {
  if (!isTasteEnabled()) return null;

  const entries = (await readAllTaste()).filter(e => e.confidence >= TASTE_APPLY_THRESHOLD);
  if (entries.length === 0) return null;

  // Group by category so the injected block mirrors the .commandcode/taste/
  // package layout — the model sees cli, typescript, architecture buckets.
  const byCategory = new Map<string, typeof entries>();
  for (const e of entries) {
    const bucket = byCategory.get(e.category) ?? [];
    bucket.push(e);
    byCategory.set(e.category, bucket);
  }

  const sections: string[] = [];
  for (const category of TASTE_CATEGORIES.filter(c => byCategory.has(c))) {
    const catEntries = byCategory.get(category)!;
    sections.push(`### ${category}`, '', ...catEntries.map(e => formatTasteLine(e)));
  }

  return [
    '# Taste',
    '',
    'Standing preferences learned from how this user works. Follow them without being asked. An explicit instruction in the current conversation always wins over anything here.',
    '',
    ...sections,
  ].join('\n');
}

function formatTasteLine(e: TasteEntry): string {
  const hedge = e.confidence >= 0.9 ? '' : ` (inferred, ${Math.round(e.confidence * 100)}% confidence)`;
  return `- ${e.text}${hedge}`;
}

/**
 * Parses an extraction agent's final text and persists whatever taste it
 * reported. Returns only the entries that were actually new — the agent
 * restating a known preference is common and must not read as learning.
 */
export async function learnTasteFromText(text: string): Promise<TasteEntry[]> {
  if (!isTasteEnabled()) return [];

  const candidates = parseTasteBlock(text);
  if (candidates.length === 0) return [];

  return persistTasteCandidates(candidates);
}

export async function persistTasteCandidates(candidates: TasteCandidate[]): Promise<TasteEntry[]> {
  const byScope = {
    global: candidates.filter(c => c.scope === 'global'),
    project: candidates.filter(c => c.scope === 'project'),
  };

  const [global, project] = await Promise.all([
    appendTaste('global', byScope.global),
    appendTaste('project', byScope.project),
  ]);
  const learned = [...global, ...project];

  if (learned.length > 0) {
    logForDebugging(`[taste] learned ${learned.length}: ${learned.map(e => e.text).join(' | ')}`);
  }
  return learned;
}

/** Known taste as plain text, for telling the extraction agent what to skip. */
export async function listKnownTasteText(): Promise<string[]> {
  if (!isTasteEnabled()) return [];
  return (await readAllTaste()).map(e => e.text);
}
