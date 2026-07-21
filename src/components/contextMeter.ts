/**
 * Rendering helpers for the context-pressure indicator.
 *
 * The old readout was a bare "9% until auto-compact", which was ambiguous in
 * both directions: it reads as "9% of the context is used" (it isn't — 91% is)
 * and it names a threshold the user can't see. These helpers instead show
 * consumption directly, plus what is about to happen and whether a summary has
 * already been prepared in the background.
 */

export const METER_WIDTH = 10;

const FILLED = '█'; // █
const EMPTY = '░'; // ░

/** Fixed-width bar. `percentUsed` is clamped to 0..100. */
export function renderMeter(percentUsed: number, width: number = METER_WIDTH): string {
  const clamped = Math.max(0, Math.min(100, percentUsed));
  // Only a completely empty gauge shows zero cells; anything above 0% keeps at
  // least one lit cell so the bar never reads as "nothing used".
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round((clamped / 100) * width));
  return FILLED.repeat(filled) + EMPTY.repeat(Math.max(0, width - filled));
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(Math.max(0, Math.round(tokens)));
}

export type ContextMeterMode =
  | { kind: 'auto-compact'; backgroundReady: boolean; backgroundRunning: boolean }
  | { kind: 'reactive-only' }
  | { kind: 'manual' };

export type ContextMeterInput = {
  /** Percent of the budget still available (0..100). */
  percentLeft: number;
  /** Tokens still available before the trigger fires. */
  tokensLeft: number;
  mode: ContextMeterMode;
};

/**
 * Trailing clause explaining what happens at 100%, so the number is actionable
 * rather than merely alarming.
 */
export function describeContextOutcome(mode: ContextMeterMode, percentLeft: number): string {
  switch (mode.kind) {
    case 'reactive-only':
      return 'compacts when full';
    case 'manual':
      return 'run /compact to free space';
    case 'auto-compact': {
      if (mode.backgroundReady) return 'summary ready';
      if (mode.backgroundRunning) return 'preparing summary…';
      return percentLeft <= 2 ? 'auto-compacting now' : 'auto-compacts at 80%';
    }
  }
}

/** Full single-line label, e.g. "Context █████████░ 91% · 9.2k left · summary ready". */
export function formatContextMeter({ percentLeft, tokensLeft, mode }: ContextMeterInput): string {
  const percentUsed = Math.max(0, Math.min(100, 100 - percentLeft));
  return [
    `Context ${renderMeter(percentUsed)} ${percentUsed}%`,
    `${formatTokens(tokensLeft)} left`,
    describeContextOutcome(mode, percentLeft),
  ].join(' · ');
}
