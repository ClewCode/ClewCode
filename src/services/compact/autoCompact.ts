/**
 * Context-budget thresholds and the auto-compact enablement switch.
 *
 * What used to live here — the compaction *mechanism* — moved to
 * services/compact/v2 in phase 5 of docs/architecture/auto-compact-v2.md.
 * Specifically removed:
 *
 * - `autoCompactIfNeeded` / `shouldAutoCompact`: replaced by `runCompaction`,
 *   which plans a set of reducers against a token deficit instead of firing a
 *   single mechanism at a threshold crossing.
 * - The background pre-compaction job and its delta-merge: unnecessary once
 *   cheap reducers can run mid-tool-chain, which is what the background job
 *   existed to work around.
 * - The compact-regret feedback loop: it could only *measure* damage, because
 *   the content it tracked was gone. v2 evicts to a restorable store, so the
 *   signal is now the ContextRestore rate — an outcome the model can act on
 *   rather than a statistic.
 * - The turn-count cooldown and the failure circuit breaker: both existed
 *   because compaction could not guarantee how much it would reclaim. v2
 *   states the goal in tokens (`softTarget`) and has a `drop` reducer that can
 *   always reach it.
 *
 * What remains is the arithmetic the UI and other subsystems still ask for,
 * all of it derived from v2/limits.ts.
 */
import type { Message } from '../../types/message.js';
import { getGlobalConfig } from '../../utils/config.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { roughTokenCountEstimationForBlock } from '../tokenEstimation.js';
import {
  CRITICAL_BUFFER_TOKENS,
  computeEffectiveWindow,
  computeLimits,
  DEFAULT_BUFFER_TOKENS,
  FORCE_BUFFER_TOKENS,
  MANUAL_COMPACT_BUFFER_TOKENS,
  WARN_BUFFER_TOKENS,
} from './v2/limits.js';

// Returns the context window size minus the max output tokens for the model.
// The arithmetic lives in v2/limits.ts so every threshold derives from one
// place. This wrapper is kept because several modules import it (attachments,
// analyzeContext, TokenWarning, tests).
export function getEffectiveContextWindowSize(model: string): number {
  return computeEffectiveWindow(model);
}

/**
 * Per-turn compaction bookkeeping the REPL and resume path read.
 *
 * `consecutiveFailures` is no longer a circuit breaker — v2 cannot fail to
 * reclaim, since `drop` always can — but it is still reported so a session
 * that keeps hitting summarization errors is visible.
 */
export type AutoCompactTrackingState = {
  compacted: boolean;
  turnCounter: number;
  // Unique ID per turn
  turnId: string;
  consecutiveFailures?: number;
};

// These export v2/limits.ts values so existing importers and internal functions work.
export {
  BACKGROUND_MIN_THRESHOLD_PCT as BACKGROUND_AUTOCOMPACT_MIN_THRESHOLD_PCT,
  CRITICAL_BUFFER_TOKENS as ERROR_THRESHOLD_BUFFER_TOKENS,
  DEFAULT_BUFFER_TOKENS as AUTOCOMPACT_BUFFER_TOKENS,
  FORCE_BUFFER_TOKENS as AUTOCOMPACT_HARD_BUFFER_TOKENS,
  MANUAL_COMPACT_BUFFER_TOKENS,
  WARN_BUFFER_TOKENS as WARNING_THRESHOLD_BUFFER_TOKENS,
} from './v2/limits.js';

/**
 * Check if the conversation is at a natural boundary where compacting is safe.
 * A natural boundary means we're not mid-tool-chain: the last assistant turn
 * has no pending tool_use blocks waiting for tool_result.
 *
 * Returns true when:
 * - The last message is an assistant message with NO tool_use blocks (task done)
 * - The last message is a user message that is NOT a tool_result (new user prompt)
 *
 * Returns false when mid-chain:
 * - The last assistant message has tool_use blocks (waiting for tool results)
 * - The last user message contains tool_result blocks (tools still running)
 */
export function isAtNaturalBoundary(messages: Message[]): boolean {
  const tail = messages.at(-1);
  if (!tail) return true; // empty conversation = boundary

  if (tail.type === 'assistant') {
    const content = (tail as import('../../types/message.js').AssistantMessage).message?.content;
    if (!Array.isArray(content)) return true; // no content blocks = done
    return !(content as { type?: string }[]).some(block => block.type === 'tool_use');
  }

  if (tail.type === 'user') {
    const content = (tail as import('../../types/message.js').UserMessage).message?.content;
    if (!Array.isArray(content)) return true; // string content = user typed text
    // If the user message contains tool_result blocks, we're mid-chain
    return !(content as { type?: string }[]).some(block => block.type === 'tool_result');
  }

  return true; // system / progress / other = boundary
}

/**
 * Estimate compressibility ratio (0..1) of a session.
 * Tool_result tokens / total tokens. Higher = more compressible.
 */
export function estimateCompressibility(messages: Message[]): number {
  let totalTokens = 0;
  let toolResultTokens = 0;

  for (const message of messages) {
    if (message.type !== 'user' && message.type !== 'assistant') continue;
    const content = (
      message as import('../../types/message.js').AssistantMessage | import('../../types/message.js').UserMessage
    ).message?.content;
    if (!Array.isArray(content)) {
      if (typeof content === 'string') {
        totalTokens += Math.ceil(content.length / 4);
      }
      continue;
    }
    for (const block of content as { type?: string }[]) {
      // Delegate to the canonical estimator rather than re-deriving per-block
      // sizes here. A hand-rolled version once counted a tool_use as just its
      // *name* (dropping `input`, which carries bash commands and Edit diffs)
      // and ignored thinking blocks entirely. Both undercounts landed on
      // totalTokens only, never on toolResultTokens, so the ratio was pushed
      // toward 1 — selecting the smallest buffer and pushing auto-compact
      // dangerously close to the context ceiling.
      const t = roughTokenCountEstimationForBlock(block as import('../tokenEstimation.js').ContentBlockParam);
      totalTokens += t;
      if (block.type === 'tool_result') {
        toolResultTokens += t;
      }
    }
  }

  if (totalTokens === 0) return 0;
  return Math.min(1, toolResultTokens / totalTokens);
}

/**
 * Headroom buffer for this session. A tool-heavy (highly compressible) session
 * can safely run closer to the ceiling, because v2's cheap reducers will
 * reclaim plenty when it gets there; a chat-only session cannot, so it needs
 * to start reducing sooner.
 */
export function resolveAdaptiveBuffer(): number {
  // Always use static buffer — adaptive sizing disabled for predictability.
  return DEFAULT_BUFFER_TOKENS;
}

export function getAutoCompactThreshold(model: string): number {
  return computeLimits(model, resolveAdaptiveBuffer()).actNow;
}

export function calculateTokenWarningState(
  tokenUsage: number,
  model: string,
): {
  percentLeft: number;
  isAboveWarningThreshold: boolean;
  isAboveErrorThreshold: boolean;
  isAboveAutoCompactThreshold: boolean;
  isAtBlockingLimit: boolean;
} {
  const limits = computeLimits(model, resolveAdaptiveBuffer());
  // When auto-compact is off there is no act threshold to warn against, so the
  // bands are measured off the full usable window instead.
  const threshold = isAutoCompactEnabled() ? limits.actNow : limits.limit;

  return {
    percentLeft: Math.max(0, Math.round(((threshold - tokenUsage) / threshold) * 100)),
    isAboveWarningThreshold: tokenUsage >= threshold - WARN_BUFFER_TOKENS,
    isAboveErrorThreshold: tokenUsage >= threshold - CRITICAL_BUFFER_TOKENS,
    isAboveAutoCompactThreshold: isAutoCompactEnabled() && tokenUsage >= limits.actNow,
    isAtBlockingLimit: tokenUsage >= limits.blocking,
  };
}

export function isAutoCompactEnabled(): boolean {
  if (isEnvTruthy(process.env.DISABLE_COMPACT)) {
    return false;
  }
  // Allow disabling just auto-compact (keeps manual /compact working)
  if (isEnvTruthy(process.env.DISABLE_AUTO_COMPACT)) {
    return false;
  }
  // Check if user has disabled auto-compact in their settings
  return getGlobalConfig().autoCompactEnabled;
}
