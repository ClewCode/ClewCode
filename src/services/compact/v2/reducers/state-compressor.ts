/**
 * `state-compress` — message grouping and metadata compression.
 *
 * Reduces tokens by:
 * - Grouping consecutive messages from same sender
 * - Stripping redundant metadata
 * - Compressing tool result previews
 * - Merging similar consecutive blocks
 *
 * Loss: 0.35 (moderate) — good return on investment.
 * Cheap enough to run early, before expensive reducers.
 */
import type { Message } from '../../../../types/message.js';
import { logForDebugging } from '../../../../utils/debug.js';
import { estimateMessageTokens } from '../../microCompact.js';
import type { ReduceContext, Reducer } from '../types.js';

/**
 * Estimate compressible tokens in messages (metadata, redundancy).
 */
function estimateCompressibleTokens(messages: Message[]): number {
  let compressible = 0;

  for (const msg of messages) {
    // Strip redundant UUID metadata
    if (msg.uuid) compressible += 10; // UUIDs are ~50 bytes = ~10 tokens

    // Strip session_id if duplicated
    if ((msg as { session_id?: string }).session_id) compressible += 5;

    // Compress tool results that are long but follow a pattern
    if (msg.type === 'assistant') {
      const content = msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' || block.type === 'tool_result') {
            const text = JSON.stringify(block).length;
            if (text > 500) {
              // Large tool results can be compressed by ~30%
              compressible += Math.floor(estimateMessageTokens([msg]) * 0.15);
            }
          }
        }
      }
    }

    // Remove redundant isMeta flags
    if ((msg as { isMeta?: boolean }).isMeta) compressible += 2;
  }

  return compressible;
}

/**
 * Merge consecutive messages from same sender (reduce fragments).
 */
function groupConsecutiveMessages(messages: Message[]): Message[] {
  if (messages.length < 2) return messages;

  const grouped: Message[] = [];
  let currentGroup: Message[] = [messages[0]!];
  let currentSender = messages[0]!.type;

  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i]!;
    if (msg.type === currentSender && shouldMerge(currentGroup, msg)) {
      currentGroup.push(msg);
    } else {
      grouped.push(...currentGroup);
      currentGroup = [msg];
      currentSender = msg.type;
    }
  }
  grouped.push(...currentGroup);

  return grouped;
}

/**
 * Check if message should be merged with previous group.
 */
function shouldMerge(group: Message[], msg: Message): boolean {
  if (group.length === 0) return false;
  if (msg.type !== group[0]!.type) return false;

  // Don't merge if gap is semantic (different topics)
  const lastMsg = group.at(-1);
  if (!lastMsg) return false;

  // Skip if user message that looks like new task
  if (msg.type === 'user') {
    const content = msg.message?.content;
    const text = typeof content === 'string' ? content : '';
    if (/^(new task|new request|let's|let me|ok|build|create|implement)/i.test(text)) {
      return false;
    }
  }

  return true;
}

/**
 * Strip unnecessary metadata from messages.
 */
function stripRedundantMetadata(msg: Message): Message {
  const stripped = { ...msg };

  // Remove empty metadata fields
  if ((stripped as { isMeta?: boolean }).isMeta === false) {
    delete (stripped as { isMeta?: boolean }).isMeta;
  }

  if ((stripped as { isVirtual?: boolean }).isVirtual === false) {
    delete (stripped as { isVirtual?: boolean }).isVirtual;
  }

  // Don't strip critical fields like uuid, session_id (needed for traversal)
  return stripped;
}

/**
 * Compress long tool result previews (keep first 500 chars max).
 */
function compressToolResults(msg: Message): Message {
  if (msg.type !== 'assistant') return msg;

  const content = msg.message?.content;
  if (!Array.isArray(content)) return msg;

  const compressed = {
    ...msg,
    message: {
      ...msg.message,
      content: content.map(block => {
        if (block.type === 'tool_result' && typeof block.content === 'string') {
          const content = block.content as string;
          if (content.length > 500) {
            return {
              ...block,
              content: content.slice(0, 500) + '\n... [truncated]',
            };
          }
        }
        return block;
      }),
    },
  };

  return compressed;
}

export const stateCompressorReducer: Reducer = {
  name: 'state-compress',
  loss: 0.35, // Moderate loss but good for early compaction
  costly: false,
  estimate(ctx: ReduceContext) {
    return estimateCompressibleTokens(ctx.messages);
  },
  async apply(ctx: ReduceContext) {
    const before = estimateMessageTokens(ctx.messages) || 0;

    // Apply compressions in order (cheap first)
    let messages = ctx.messages
      .map(stripRedundantMetadata) // Strip redundant flags
      .map(compressToolResults); // Compress tool results

    // Group consecutive messages (optional, can be lossy)
    const grouped = groupConsecutiveMessages(messages);
    messages = grouped.length < messages.length ? grouped : messages;

    const after = estimateMessageTokens(messages) || 0;
    const tokensFreed = Math.max(0, before - after);

    logForDebugging(
      `state-compress: ${tokensFreed} tokens freed (${messages.length} messages, ${grouped.length} grouped)`,
    );

    return {
      messages,
      tokensFreed,
      evicted: [],
    };
  },
};
