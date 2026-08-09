/**
 * Long-turn recap — appends a short "what happened / what's next" recap
 * right after a turn that ran long finishes, so the user doesn't have to
 * scroll back through a long tool-use trace to reorient.
 *
 * Reuses the same summary generator and message shape as the away/blur
 * recap (src/services/awaySummary.ts) — same config toggle, same format.
 */
import { hasSummarySinceLastUserTurn } from '../hooks/useAwaySummary.js';
import { getTerminalFocused } from '../ink/terminal-focus-state.js';
import type { Message } from '../types/message.js';
import { getGlobalConfig } from '../utils/config.js';
import { isEnvDefinedFalsy } from '../utils/envUtils.js';
import { createAwaySummaryMessage } from '../utils/messages.js';
import { generateAwaySummary, hasRecappableConversation } from './awaySummary.js';

const DEFAULT_THRESHOLD_MS = 5 * 60_000;

/**
 * Decide whether the turn that just completed warrants an automatic recap.
 * No I/O — cheap to call on every turn completion.
 */
export function shouldGenerateLongTurnRecap(turnDurationMs: number, messages: readonly Message[]): boolean {
  const config = getGlobalConfig();
  if (config.recapEnabled === false) return false;
  if (isEnvDefinedFalsy(process.env.CLEW_CODE_ENABLE_AWAY_SUMMARY)) return false;
  if (isEnvDefinedFalsy(process.env.CLEW_ENABLE_RECAP)) return false;

  const threshold =
    typeof config.longTurnRecapThresholdMs === 'number' &&
    Number.isFinite(config.longTurnRecapThresholdMs) &&
    config.longTurnRecapThresholdMs >= 0
      ? config.longTurnRecapThresholdMs
      : DEFAULT_THRESHOLD_MS;

  if (turnDurationMs < threshold) return false;

  // Only recap someone who wasn't watching. The point of this recap is to
  // spare you scrolling back through a long tool trace you missed -- if you
  // sat through the turn you already know what happened, and a summary of it
  // is noise. Agentic turns routinely run past the threshold, so without this
  // the recap fired at the end of nearly every long piece of work.
  //
  // terminal-focus-state documents that consumers treat 'unknown' as
  // 'focused', and getTerminalFocused() encodes that: only an explicit blur
  // counts as away. Terminals that don't report focus therefore never get the
  // long-turn recap -- the deliberate trade for not interrupting people who
  // are present.
  if (getTerminalFocused()) return false;

  // A session with no actual exchange has nothing to recap. Checked here as
  // well as in generateAwaySummary so a long turn with no conversation (e.g.
  // startup work before the first prompt) does not spend an API call to
  // discover that.
  if (!hasRecappableConversation(messages)) return false;
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
