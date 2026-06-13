import type { Message } from '../../types/message.js';
import { groupMessagesByApiRound } from './grouping.js';

export const POST_COMPACT_RECENT_TAIL_TOKEN_BUDGET = 20_000;
export const POST_COMPACT_MIN_RECENT_API_ROUNDS = 2;

function isCompactBoundary(message: Message): boolean {
  return message.type === 'system' && message.subtype === 'compact_boundary';
}

function roughMessageTokens(message: Message): number {
  const content =
    typeof message.message === 'object' && message.message !== null && 'content' in message.message
      ? message.message.content
      : undefined;
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }
  if (content !== undefined) {
    return Math.ceil(JSON.stringify(content).length / 4);
  }
  return 0;
}

function roughMessagesTokens(messages: Message[]): number {
  return messages.reduce((tokens, message) => tokens + roughMessageTokens(message), 0);
}

/**
 * Preserve the most recent API-safe rounds after full compaction.
 *
 * The compact summary carries long-term context, while this tail keeps the
 * current task runnable and gives session resume a preserved segment to relink.
 */
export function selectPostCompactMessagesToKeep(
  messages: Message[],
  tokenBudget = POST_COMPACT_RECENT_TAIL_TOKEN_BUDGET,
  minApiRounds = POST_COMPACT_MIN_RECENT_API_ROUNDS,
): Message[] {
  const lastBoundaryIndex = messages.findLastIndex(message => isCompactBoundary(message));
  const eligibleMessages = messages
    .slice(lastBoundaryIndex === -1 ? 0 : lastBoundaryIndex + 1)
    .filter(
      message =>
        message.type !== 'progress' &&
        !isCompactBoundary(message) &&
        !(message.type === 'user' && message.isCompactSummary),
    );
  const groups = groupMessagesByApiRound(eligibleMessages);
  const selectedGroups: Message[][] = [];
  let selectedTokens = 0;

  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]!;
    const groupTokens = roughMessagesTokens(group);
    const mustKeepForContinuity = selectedGroups.length < minApiRounds;
    if (!mustKeepForContinuity && selectedTokens + groupTokens > tokenBudget) {
      break;
    }
    selectedGroups.unshift(group);
    selectedTokens += groupTokens;
  }

  return selectedGroups.flat();
}
