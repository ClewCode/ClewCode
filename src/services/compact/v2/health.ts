/**
 * Auto-compact v2 — surfacing the one failure that matters.
 *
 * `shortfall` means the planner ran every reducer it could and still did not
 * free the tokens it needed. It is the only path from v2 to a `prompt_too_long`
 * — the `drop` reducer exists precisely so it should never happen — which
 * makes it the signal worth watching now that v2 is the default.
 *
 * Until this file, shortfall went to `logEvent` and nowhere else: invisible to
 * the person it is happening to, and invisible to anyone without analytics
 * access. Here it is recorded per session so the REPL can warn once and
 * /context can show it.
 *
 * Deliberately module-scoped, unlike CompactSessionState: /context and the
 * notification path do not receive the session state object, and this is
 * display-only data — a wrong read shows a stale warning, it does not
 * mis-compact anything.
 */
import type { ReducerName } from './types.js';

export interface CompactHealth {
  /** Reducers applied on the most recent compaction. */
  lastApplied: ReducerName[];
  /** Tokens the last compaction actually reclaimed. */
  lastTokensFreed: number;
  /** Tokens the last compaction was asked to reclaim. */
  lastDeficit: number;
  /** True when the last compaction could not reach its target. */
  lastShortfall: boolean;
  /** How many shortfalls this session has seen. */
  shortfallCount: number;
  /** Human-readable reason from the planner, for /context. */
  lastRationale: string;
  /** Times the model pulled evicted content back with ContextRestore. */
  restoreCount: number;
  /** Compactions performed this session — the denominator for restore rate. */
  compactionCount: number;
}

const EMPTY: CompactHealth = {
  lastApplied: [],
  lastTokensFreed: 0,
  lastDeficit: 0,
  lastShortfall: false,
  shortfallCount: 0,
  lastRationale: '',
  restoreCount: 0,
  compactionCount: 0,
};

let health: CompactHealth = { ...EMPTY };

export function getCompactHealth(): Readonly<CompactHealth> {
  return health;
}

export function recordCompaction(result: {
  applied: ReducerName[];
  tokensFreed: number;
  deficit: number;
  shortfall: boolean;
  rationale: string;
}): void {
  health = {
    ...health,
    lastApplied: result.applied,
    lastTokensFreed: result.tokensFreed,
    lastDeficit: result.deficit,
    lastShortfall: result.shortfall,
    lastRationale: result.rationale,
    shortfallCount: health.shortfallCount + (result.shortfall ? 1 : 0),
    compactionCount: health.compactionCount + 1,
  };
}

export function recordRestore(): void {
  health = { ...health, restoreCount: health.restoreCount + 1 };
}

export function resetCompactHealth(): void {
  health = { ...EMPTY };
}

/**
 * The warning to show the user, or null when nothing is wrong.
 *
 * Worded to be actionable rather than alarming: a shortfall is recoverable —
 * the session keeps working, it is just running closer to the ceiling than the
 * planner wanted.
 */
export function shortfallWarning(): string | null {
  if (!health.lastShortfall) return null;
  const short = Math.max(0, health.lastDeficit - health.lastTokensFreed);
  const repeated = health.shortfallCount > 1 ? ` (${health.shortfallCount}× this session)` : '';
  return `Context is tight: compaction freed ${formatK(health.lastTokensFreed)} of the ${formatK(health.lastDeficit)} it needed, ${formatK(short)} short${repeated}. Consider /compact or starting a new session.`;
}

/** One line for /context, or null when no compaction has run yet. */
export function compactHealthLine(): string | null {
  if (health.compactionCount === 0) return null;
  const parts = [
    `${health.compactionCount} compaction${health.compactionCount === 1 ? '' : 's'}`,
    health.lastApplied.length > 0 ? `last: ${health.lastApplied.join(' + ')}` : 'last: nothing applied',
    `freed ${formatK(health.lastTokensFreed)}`,
  ];
  if (health.restoreCount > 0) {
    parts.push(`${health.restoreCount} restored`);
  }
  if (health.shortfallCount > 0) {
    parts.push(`${health.shortfallCount} shortfall${health.shortfallCount === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

function formatK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}
