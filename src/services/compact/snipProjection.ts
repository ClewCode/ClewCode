import type { Message } from 'src/types/message.js';

// Snip projection helpers. Pair of snipCompact.ts — see that file for why
// these are safe no-ops. projectSnippedView returns the input unchanged so
// callers that gate on HISTORY_SNIP keep their existing (un-snipped) view.
export function isSnipBoundaryMessage(_message: Message): boolean {
  return false;
}

export function projectSnippedView<T extends Message>(messages: T[]): T[] {
  return messages;
}
