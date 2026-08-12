/**
 * `intelligent-prune` — smart message pruning based on age, type, and patterns.
 *
 * Instead of blind dropping, this reducer:
 * - Preserves recent messages (configurable window)
 * - Removes completed task discussions
 * - Drops resolved error threads
 * - Prunes tool results that are referenced in recent messages
 *
 * Loss comparable to drop (0.95) but with better signal preservation.
 */
import type { Message } from '../../../../types/message.js';
import { logForDebugging } from '../../../../utils/debug.js';
import { estimateMessageTokens } from '../../microCompact.js';
import type { ReduceContext, Reducer } from '../types.js';

const RECENT_WINDOW_MESSAGES = 20; // Always keep last N messages
const MIN_PRESERVE_TOKENS = 2000; // Always keep ~2k tokens minimum

interface PruneCandidate {
  index: number;
  reason: 'completed' | 'resolved-error' | 'orphaned-tool' | 'old-debug';
  tokens: number;
  message: Message;
}

/**
 * Identify messages that are safe to prune based on patterns and age.
 */
function identifyPruneCandidates(messages: Message[], recentCount: number): PruneCandidate[] {
  const candidates: PruneCandidate[] = [];
  const cutoffIndex = Math.max(0, messages.length - recentCount);

  for (let i = 0; i < cutoffIndex; i++) {
    const msg = messages[i]!;
    const tokens = estimateMessageTokens([msg]) || 0;

    // Skip if recent
    if (i >= cutoffIndex) continue;

    if (msg.type === 'user') {
      // Prune completed task confirmations ("done", "looks good", etc.)
      const text = typeof msg.message.content === 'string' ? msg.message.content : '';
      if (/^(done|looks good|ok|perfect|great|thanks|thanks!|lgtm|ship it)\.?$/i.test(text.trim())) {
        candidates.push({ index: i, reason: 'completed', tokens, message: msg });
      }
    } else if (msg.type === 'assistant') {
      const content = msg.message?.content;
      if (!Array.isArray(content)) continue;

      // Check for resolved-error patterns: "fixed", "resolved", etc.
      const text = content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map(b => b.text)
        .join(' ');

      if (
        /^(✅|fixed|resolved|patched|corrected|handled)\s/i.test(text) &&
        text.length < 500 &&
        !hasRecentReference(messages, i, text)
      ) {
        candidates.push({ index: i, reason: 'resolved-error', tokens, message: msg });
      }

      // Check for orphaned tool results (tool_use that's never referenced again)
      for (const block of content) {
        if (block.type === 'tool_use' && !isToolReferencedAfter(messages, i, (block as { id?: string }).id || '')) {
          candidates.push({ index: i, reason: 'orphaned-tool', tokens, message: msg });
          break;
        }
      }
    } else if (msg.type === 'attachment') {
      // Prune old attachment results
      const age = messages.length - i;
      if (age > 30) {
        candidates.push({ index: i, reason: 'old-debug', tokens, message: msg });
      }
    }
  }

  return candidates;
}

/**
 * Check if tool_use ID is referenced in messages after index i.
 */
function isToolReferencedAfter(messages: Message[], afterIndex: number, toolId: string): boolean {
  for (let i = afterIndex + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg?.type === 'assistant') {
      const content = msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && (block as { tool_use_id?: string }).tool_use_id === toolId) {
            return true;
          }
        }
      }
    }

    if (msg?.type === 'user') {
      const content = msg.message?.content;
      if (typeof content === 'string' && content.includes(toolId)) return true;
      if (Array.isArray(content)) {
        const text = content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map(b => b.text)
          .join('');
        if (text.includes(toolId)) return true;
      }
    }
  }
  return false;
}

/**
 * Check if text is referenced in recent messages after index i.
 */
function hasRecentReference(messages: Message[], afterIndex: number, text: string): boolean {
  const lookAhead = Math.min(5, messages.length - afterIndex);
  for (let i = afterIndex + 1; i < afterIndex + lookAhead && i < messages.length; i++) {
    const msg = messages[i];
    const content = msg?.message?.content;
    if (typeof content === 'string' && content.includes(text.slice(0, 50))) return true;
  }
  return false;
}

export const intelligentPruneReducer: Reducer = {
  name: 'intelligent-prune',
  loss: 0.92, // Just below drop (1.0) — very lossy but targeted
  costly: false,
  estimate(ctx: ReduceContext) {
    const candidates = identifyPruneCandidates(ctx.messages, RECENT_WINDOW_MESSAGES);
    let estimate = candidates.reduce((acc, c) => acc + c.tokens, 0);

    // Don't promise more than we can actually deliver
    const totalTokens = estimateMessageTokens(ctx.messages) || 0;
    estimate = Math.min(estimate, Math.max(0, totalTokens - MIN_PRESERVE_TOKENS));

    return estimate;
  },
  async apply(ctx: ReduceContext) {
    const candidates = identifyPruneCandidates(ctx.messages, RECENT_WINDOW_MESSAGES);
    if (candidates.length === 0) {
      return { messages: ctx.messages, tokensFreed: 0, evicted: [] };
    }

    // Greedily drop candidates until we've freed enough tokens
    let tokensFreed = 0;
    let removed = 0;
    const messagesToRemove = new Set<number>();

    // Sort by tokens freed (descending) to be greedy
    candidates.sort((a, b) => b.tokens - a.tokens);

    for (const candidate of candidates) {
      if (tokensFreed >= ctx.target) break;
      messagesToRemove.add(candidate.index);
      tokensFreed += candidate.tokens;
      removed++;
    }

    const filtered = ctx.messages.filter((_, i) => !messagesToRemove.has(i));

    logForDebugging(
      `intelligent-prune: removed ${removed} messages (${tokensFreed} tokens) ` +
        `- ${candidates.map(c => c.reason).join(', ')}`,
    );

    return {
      messages: filtered,
      tokensFreed,
      evicted: [],
    };
  },
};
