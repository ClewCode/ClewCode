/**
 * Auto-compact v2 — the single context-token account.
 *
 * The legacy system could not see the effect of reducers that removed messages
 * *after* the last API response: tokenCountWithEstimation() anchors on the last
 * assistant's `usage`, which still reflects the pre-reduction context. Callers
 * worked around it by threading a `snipTokensFreed` number through five layers
 * of function signatures (query.ts → autoCompactIfNeeded → shouldAutoCompact →
 * getCompactionStrategy). Every new reducer would have needed its own parameter.
 *
 * Here, a reducer reports what it freed via `applyDelta()` and every later
 * `measure()` reflects it. Nothing is plumbed.
 */
import type { Message } from '../../../types/message.js';
import { tokenCountWithEstimation } from '../../../utils/tokens.js';
import { type ContextLimits, computeLimits } from './limits.js';

export interface ContextPressure {
  /** Tokens the next request will actually cost. */
  used: number;
  /** Usable input budget (window − reserved output). */
  limit: number;
  /** Tokens that must be reclaimed to reach softTarget; 0 when comfortable. */
  deficit: number;
  /** used / limit, for UI and analytics. */
  ratio: number;
  /** Every derived budget number for this model. */
  limits: ContextLimits;
  /** Provenance of `used` — real API usage, pure estimate, or both. */
  basis: 'api_usage' | 'estimated' | 'mixed';
}

export interface ContextLedger {
  measure(messages: readonly Message[], model: string): ContextPressure;
  /** Report tokens reclaimed by a reducer this turn. */
  applyDelta(tokens: number): void;
  /** Total reclaimed but not yet visible in the anchor message's usage. */
  pendingDelta(): number;
  /** Called once per turn boundary, after a fresh API response lands. */
  reset(): void;
}

export function createContextLedger(): ContextLedger {
  let freed = 0;

  return {
    measure(messages, model) {
      const limits = computeLimits(model);
      const raw = tokenCountWithEstimation(messages);
      const used = Math.max(0, raw - freed);
      return {
        used,
        limit: limits.limit,
        deficit: Math.max(0, used - limits.softTarget),
        ratio: limits.limit > 0 ? used / limits.limit : 0,
        limits,
        basis: basisFor(messages, freed),
      };
    },
    applyDelta(tokens) {
      if (Number.isFinite(tokens) && tokens > 0) {
        freed += tokens;
      }
    },
    pendingDelta() {
      return freed;
    },
    reset() {
      freed = 0;
    },
  };
}

function basisFor(messages: readonly Message[], freed: number): ContextPressure['basis'] {
  const hasApiUsage = messages.some(m => m.type === 'assistant');
  if (!hasApiUsage) return 'estimated';
  return freed > 0 ? 'mixed' : 'api_usage';
}

/**
 * Whether the pressure warrants acting at all, and how urgently.
 *
 * `none`     — comfortable.
 * `soft`     — act at the next natural boundary; cheap reducers may run now.
 * `force`    — act immediately, mid-tool-chain if necessary.
 */
export type PressureLevel = 'none' | 'soft' | 'force';

export function pressureLevel(pressure: ContextPressure): PressureLevel {
  if (pressure.used >= pressure.limits.actForce) return 'force';
  if (pressure.used >= pressure.limits.actNow) return 'soft';
  return 'none';
}
