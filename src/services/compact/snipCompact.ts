import type { Message } from 'src/types/message.js';

// Snip compaction runtime helpers. The HISTORY_SNIP feature surface that
// consumes these symbols was implemented against modules that were never
// committed; these safe no-op definitions restore type-checking and keep the
// feature inert until real runtime logic is reintroduced.
export function isSnipMarkerMessage(_message: Message): boolean {
  return false;
}

export function isSnipRuntimeEnabled(): boolean {
  return false;
}

export const SNIP_NUDGE_TEXT = 'Condense older context with a snip.';

export function shouldNudgeForSnips(_messages: Message[]): boolean {
  return false;
}

export function snipCompactIfNeeded(
  messages: Message[],
  _options?: { force?: boolean },
): { messages: Message[]; executed: boolean } {
  return { messages, executed: false };
}
