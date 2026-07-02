/**
 * Long-turn recap — appends a short "what happened / what's next" recap
 * right after a turn that ran long finishes, so the user doesn't have to
 * scroll back through a long tool-use trace to reorient.
 *
 * Reuses the same summary generator and message shape as the away/blur
 * recap (src/services/awaySummary.ts) — same config toggle, same format.
 */
import { hasSummarySinceLastUserTurn } from '../hooks/useAwaySummary.js';
import type { Message } from '../types/message.js';
import { getGlobalConfig } from '../utils/config.js';
import { isEnvDefinedFalsy } from '../utils/envUtils.js';
import { createAwaySummaryMessage } from '../utils/messages.js';
import { generateAwaySummary } from './awaySummary.js';

const DEFAULT_THRESHOLD_MS = 5 * 60_000;

/**
 * Decide whether the turn that just completed is long enough to warrant an
 * automatic recap. Pure function — no I/O — so it's cheap to call on every
 * turn completion.
 */
export function shouldGenerateLongTurnRecap(turnDurationMs: number, messages: readonly Message[]): boolean {
  const config = getGlobalConfig();
  if (config.recapEnabled === false) return false;
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_AWAY_SUMMARY)) return false;
  if (isEnvDefinedFalsy(process.env.CLEW_ENABLE_RECAP)) return false;

  const threshold =
    typeof config.longTurnRecapThresholdMs === 'number' &&
    Number.isFinite(config.longTurnRecapThresholdMs) &&
    config.longTurnRecapThresholdMs >= 0
      ? config.longTurnRecapThresholdMs
      : DEFAULT_THRESHOLD_MS;

  if (turnDurationMs < threshold) return false;
  return !hasSummarySinceLastUserTurn(messages);
}

/**
 * Generate and append a recap message for a long-running turn that just
 * completed. Fire-and-forget safe — swallows errors, returns silently if
 * generation fails or is superseded.
 */
export async function appendLongTurnRecap(
  messages: readonly Message[],
  turnDurationMs: number,
  setMessages: (updater: (prev: Message[]) => Message[]) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!shouldGenerateLongTurnRecap(turnDurationMs, messages)) return;
  const text = await generateAwaySummary(messages, signal);
  if (signal.aborted || text === null) return;
  setMessages(prev => [...prev, createAwaySummaryMessage(text)]);
}
