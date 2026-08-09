/**
 * Auto-compact v2 — single source of truth for every context-budget number.
 *
 * Phase 0 of docs/architecture/auto-compact-v2.md: the legacy threshold
 * functions in autoCompact.ts now delegate here instead of each re-deriving
 * the same arithmetic from mutually-dependent constants. Behavior is
 * intentionally identical to the pre-v2 math — this file is a consolidation,
 * not a policy change. Policy moves to planner.ts in phase 3.
 */
import { getSdkBetas } from '../../../bootstrap/state.js';
import { getContextWindowForModel } from '../../../utils/context.js';
import { getMaxOutputTokensForModel } from '../../api/claude.js';

/** Reserve this many tokens for output during compaction (p99.99 = 17,387). */
export const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20_000;

/** Headroom for the next request's system prompt, tools, and user context. */
export const DEFAULT_BUFFER_TOKENS = 40_000;

/** Gap between the soft (boundary-aware) and hard (force) act thresholds. */
export const FORCE_BUFFER_TOKENS = 20_000;

/** Two-band UI warning offsets. `critical` must be < `warn` or the bands collapse. */
export const WARN_BUFFER_TOKENS = 20_000;
export const CRITICAL_BUFFER_TOKENS = 10_000;

/** Room a manual /compact still needs when the context is otherwise full. */
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000;

/** Background pre-compaction floor, as a fraction of the act threshold. */
export const BACKGROUND_MIN_THRESHOLD_PCT = 0.65;

/** Adaptive buffer bounds, selected by session compressibility. */
export const MIN_ADAPTIVE_BUFFER = 25_000;
export const MAX_ADAPTIVE_BUFFER = 55_000;

export interface ContextLimits {
  /** Raw context window of the model (after 1M / env overrides). */
  window: number;
  /** Output tokens reserved for a compaction summary. */
  reserved: number;
  /** window − reserved: the usable input budget. */
  limit: number;
  /**
   * Target the planner must reach *after* compacting. This is a goal, not a
   * trigger — a plan that cannot reach it has failed and must escalate.
   */
  softTarget: number;
  /** Act at the next natural boundary. */
  actNow: number;
  /** Act immediately, even mid-tool-chain. */
  actForce: number;
  /** UI: yellow band. */
  warn: number;
  /** UI: red band. */
  critical: number;
  /** Above this, even a manual /compact may not fit. */
  blocking: number;
}

/**
 * Usable input budget for a model: context window minus the output tokens a
 * compaction summary needs. Honors CLEW_CODE_AUTO_COMPACT_WINDOW as a cap.
 */
export function computeEffectiveWindow(model: string): number {
  const reserved = Math.min(getMaxOutputTokensForModel(model), MAX_OUTPUT_TOKENS_FOR_SUMMARY);
  let window = getContextWindowForModel(model, getSdkBetas());

  const override = process.env.CLEW_CODE_AUTO_COMPACT_WINDOW;
  if (override) {
    const parsed = parseInt(override, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      window = Math.min(window, parsed);
    }
  }

  return window - reserved;
}

/**
 * Derive every budget number from one buffer choice, so the constants can no
 * longer drift apart. `buffer` is the adaptive headroom the caller selected
 * (see selectBuffer); omit it for the static default.
 */
export function computeLimits(model: string, buffer: number = DEFAULT_BUFFER_TOKENS): ContextLimits {
  const reserved = Math.min(getMaxOutputTokensForModel(model), MAX_OUTPUT_TOKENS_FOR_SUMMARY);
  const limit = computeEffectiveWindow(model);
  let actNow = limit - buffer;

  // Test/dev override: express the act threshold as a percentage of the
  // usable window. Never raises the threshold — only pulls it in earlier.
  const envPercent = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
  if (envPercent) {
    const parsed = parseFloat(envPercent);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 100) {
      actNow = Math.min(Math.floor(limit * (parsed / 100)), actNow);
    }
  }

  const blockingOverride = process.env.CLEW_CODE_BLOCKING_LIMIT_OVERRIDE;
  const parsedBlocking = blockingOverride ? parseInt(blockingOverride, 10) : NaN;
  const blocking =
    !Number.isNaN(parsedBlocking) && parsedBlocking > 0 ? parsedBlocking : limit - MANUAL_COMPACT_BUFFER_TOKENS;

  return {
    window: limit + reserved,
    reserved,
    limit,
    // Compact must land far enough below actNow that the next few turns don't
    // immediately re-trigger. This is what makes the legacy turn-count cooldown
    // unnecessary: the goal is stated in tokens, not in turns.
    softTarget: Math.max(0, actNow - WARN_BUFFER_TOKENS),
    actNow,
    actForce: actNow + FORCE_BUFFER_TOKENS,
    warn: actNow - WARN_BUFFER_TOKENS,
    critical: actNow - CRITICAL_BUFFER_TOKENS,
    blocking,
  };
}

/**
 * Pick the headroom buffer from a session's compressibility ratio (0..1).
 *
 * High ratio (tool-heavy, very compressible) → smaller buffer → act later,
 * because cheap reducers will reclaim plenty. Low ratio (chat-only) → larger
 * buffer → act sooner, because there is little to reclaim without summarizing.
 */
export function selectBuffer(compressibility: number, bounds?: { minBuffer?: number; maxBuffer?: number }): number {
  const min = bounds?.minBuffer ?? MIN_ADAPTIVE_BUFFER;
  const max = bounds?.maxBuffer ?? MAX_ADAPTIVE_BUFFER;
  const ratio = Math.max(0, Math.min(1, compressibility));
  return Math.max(min, Math.min(max, Math.round(max - ratio * (max - min))));
}

/** Background pre-compaction threshold derived from the act threshold. */
export function computeBackgroundThreshold(limits: ContextLimits): number {
  return Math.max(Math.floor(limits.actNow * BACKGROUND_MIN_THRESHOLD_PCT), limits.actNow - WARN_BUFFER_TOKENS);
}
