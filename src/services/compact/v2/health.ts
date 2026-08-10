/**
 * Auto-compact v2 — surfacing the one failure that matters.
 *
 * `shortfall` means the planner ran every reducer it could and still did not
 * free the tokens it needed. It is the only path from v2 to a `prompt_too_long`
 * — the `drop` reducer exists precisely so it should never happen — which
 * makes it the signal worth watching now that v2 is the default.
 *
 * Health state is per-agent: stored on CompactSessionState.health so
 * concurrent agents do not share counters. The module-scoped fallback is
 * retained only for UI paths (ContextStats) that lack access to the session
 * state — a stale read there shows a warning, it does not mis-compact.
 */
import type { CompactSessionState, ReducerName } from './types.js';

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

export const EMPTY_HEALTH: CompactHealth = {
  lastApplied: [],
  lastTokensFreed: 0,
  lastDeficit: 0,
  lastShortfall: false,
  shortfallCount: 0,
  lastRationale: '',
  restoreCount: 0,
  compactionCount: 0,
};

/** Module-scoped fallback for UI paths without CompactSessionState. */
let fallbackHealth: CompactHealth = { ...EMPTY_HEALTH };

function healthOf(state?: CompactSessionState | null): CompactHealth {
  return state?.health ?? fallbackHealth;
}

export function getCompactHealth(state?: CompactSessionState | null): Readonly<CompactHealth> {
  return healthOf(state);
}

export function recordCompaction(
  result: {
    applied: ReducerName[];
    tokensFreed: number;
    deficit: number;
    shortfall: boolean;
    rationale: string;
  },
  state?: CompactSessionState,
): void {
  const entry: CompactHealth = {
    ...healthOf(state),
    lastApplied: result.applied,
    lastTokensFreed: result.tokensFreed,
    lastDeficit: result.deficit,
    lastShortfall: result.shortfall,
    lastRationale: result.rationale,
    shortfallCount: healthOf(state).shortfallCount + (result.shortfall ? 1 : 0),
    compactionCount: healthOf(state).compactionCount + 1,
  };
  if (state) {
    state.health = entry;
  } else {
    fallbackHealth = entry;
  }
}

export function recordRestore(state?: CompactSessionState | null): void {
  const entry = { ...healthOf(state), restoreCount: healthOf(state).restoreCount + 1 };
  if (state) {
    state.health = entry;
  } else {
    fallbackHealth = entry;
  }
}

export function resetCompactHealth(state?: CompactSessionState | null): void {
  if (state) {
    state.health = { ...EMPTY_HEALTH };
  } else {
    fallbackHealth = { ...EMPTY_HEALTH };
  }
}

/**
 * The warning to show the user, or null when nothing is wrong.
 *
 * Worded to be actionable rather than alarming: a shortfall is recoverable —
 * the session keeps working, it is just running closer to the ceiling than the
 * planner wanted.
 */
export function shortfallWarning(state?: CompactSessionState | null): string | null {
  const h = healthOf(state);
  if (!h.lastShortfall) return null;
  const short = Math.max(0, h.lastDeficit - h.lastTokensFreed);
  const repeated = h.shortfallCount > 1 ? ` (${h.shortfallCount}× this session)` : '';
  return `Context is tight: compaction freed ${formatK(h.lastTokensFreed)} of the ${formatK(h.lastDeficit)} it needed, ${formatK(short)} short${repeated}. Consider /compact or starting a new session.`;
}

/** One line for /context, or null when no compaction has run yet. */
export function compactHealthLine(state?: CompactSessionState | null): string | null {
  const h = healthOf(state);
  if (h.compactionCount === 0) return null;
  const parts = [
    `${h.compactionCount} compaction${h.compactionCount === 1 ? '' : 's'}`,
    h.lastApplied.length > 0 ? `last: ${h.lastApplied.join(' + ')}` : 'last: nothing applied',
    `freed ${formatK(h.lastTokensFreed)}`,
  ];
  if (h.restoreCount > 0) {
    parts.push(`${h.restoreCount} restored`);
  }
  if (h.shortfallCount > 0) {
    parts.push(`${h.shortfallCount} shortfall${h.shortfallCount === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

function formatK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}
