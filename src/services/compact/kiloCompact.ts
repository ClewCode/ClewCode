import type { Message } from '../../types/message.js';
import { logForDebugging } from '../../utils/debug.js';
import { tokenCountWithEstimation } from '../../utils/tokens.js';

/**
 * Project KiloCompact: Next-Gen Context Compaction Engine
 *
 * Implements high-performance, low-latency, and zero-cost local pruning
 * strategies including local AST/Regex snipping, semantic keyphrase pruning,
 * and failed-state consolidation.
 */

export interface KiloCompactOptions {
  /** Maximum token limit before pruning is triggered */
  maxTokenLimit?: number;
  /** Target token count to prune down to */
  targetTokenLimit?: number;
}

/**
 * 1. AST & Regex Snip Engine (Local & Free)
 * Instantly collapses massive terminal outputs, file reads, or directory listings locally.
 */
export function snipDeterministicBloat(content: string, maxLines = 50): string {
  if (!content) return content;

  const lines = content.split('\n');
  if (lines.length <= maxLines) {
    return content;
  }

  // Detect directory listings (e.g. ls, glob results)
  const isGlobOrDir =
    content.includes('├──') || content.includes('└──') || lines.some(l => l.trim().startsWith('Directory:'));
  if (isGlobOrDir) {
    const keepStart = lines.slice(0, 10);
    const keepEnd = lines.slice(-5);
    return [
      ...keepStart,
      `... [Collapsed ${lines.length - 15} lines of directory structure by KiloCompact] ...`,
      ...keepEnd,
    ].join('\n');
  }

  // Detect verbose compile errors or raw dump logs
  const isStackOrLog =
    content.includes('at ') || content.includes('Exception in thread') || content.includes('node_modules');
  if (isStackOrLog) {
    const keepStart = lines.slice(0, 15);
    const keepEnd = lines.slice(-10);
    return [
      ...keepStart,
      `... [Collapsed ${lines.length - 25} lines of stack traces/verbose logs by KiloCompact] ...`,
      ...keepEnd,
    ].join('\n');
  }

  // Standard large text dump fallback
  const keepStart = lines.slice(0, 20);
  const keepEnd = lines.slice(-10);
  return [
    ...keepStart,
    `... [Collapsed ${lines.length - 30} lines of large text output by KiloCompact] ...`,
    ...keepEnd,
  ].join('\n');
}

/**
 * 2. State Consolidation Engine (Tool-based Pruning)
 * Merges sequential failed or redundant tool attempts.
 */
export function consolidateToolStates(messages: Message[]): Message[] {
  const consolidated: Message[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    // Check if it's a tool-related turn
    if (msg.type === 'user' && Array.isArray(msg.content)) {
      const toolResults = msg.content.filter(block => block.type === 'tool_result');

      // If all tool results in this block are failures (e.g. errors), check if the next is also a failure
      const areAllFailed = toolResults.length > 0 && toolResults.every(r => r.isError === true);

      if (areAllFailed && i + 2 < messages.length) {
        const nextAssistant = messages[i + 1];
        const nextUser = messages[i + 2];

        // If the next user turn is also a tool result with the same name, we can consolidate
        if (nextAssistant.type === 'assistant' && nextUser.type === 'user' && Array.isArray(nextUser.content)) {
          const nextToolResults = nextUser.content.filter(block => block.type === 'tool_result');
          const isSameTool = nextToolResults.every(nr =>
            toolResults.some(r => r.toolUseId === nr.toolUseId || r.name === nr.name),
          );

          if (isSameTool) {
            logForDebugging(
              `[KiloCompact] Consolidating failed intermediate tool runs for tool: ${toolResults[0]?.name}`,
            );
            // Skip the intermediate failure turn
            i += 2;
            continue;
          }
        }
      }
    }

    consolidated.push(msg);
    i++;
  }

  return consolidated;
}

/**
 * 3. Semantic Pruning Engine (Keyword Relevance)
 * Scores messages based on task-related keywords and prunes lower relevance turns first.
 */
export function semanticPruneHistory(messages: Message[], targetLimit: number): Message[] {
  let currentTokens = tokenCountWithEstimation(messages);
  if (currentTokens <= targetLimit || messages.length <= 4) {
    return messages;
  }

  // Find user's ultimate goal from the first few turns and last few turns
  const goals = messages.filter(m => m.type === 'user' && typeof m.content === 'string').map(m => m.content as string);

  const keywords = Array.from(
    new Set(
      goals
        .join(' ')
        .toLowerCase()
        .match(/\b[a-zA-Z]{4,15}\b/g) || [],
    ),
  ).filter(word => !['what', 'with', 'this', 'that', 'from', 'your', 'have', 'there', 'their'].includes(word));

  const scoredMessages = messages.map((msg, index) => {
    // Never prune the system prompt, first 2 turns, or the last 3 turns
    if (index === 0 || index <= 2 || index >= messages.length - 3) {
      return { msg, score: Infinity, index };
    }

    let score = 0;

    // Safely extract text content across different Message layouts
    let contentToSearch = '';
    if (msg.content) {
      contentToSearch = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    } else if (msg.message && typeof msg.message === 'object' && 'content' in msg.message) {
      const mc = msg.message.content;
      contentToSearch = typeof mc === 'string' ? mc : JSON.stringify(mc);
    } else if ('text' in msg && typeof msg.text === 'string') {
      contentToSearch = msg.text;
    }

    const textContent = contentToSearch.toLowerCase();

    // Score based on keyword relevance
    for (const word of keywords) {
      if (textContent.includes(word)) {
        score += 10;
      }
    }

    // Retain success actions with higher scores
    if (textContent.includes('success') || textContent.includes('completed')) {
      score += 30;
    }

    return { msg, score, index };
  });

  // Sort by score ascending (lowest score is pruned first)
  const prunable = scoredMessages.filter(sm => sm.score !== Infinity);
  prunable.sort((a, b) => a.score - b.score);

  const prunedIds = new Set<number>();

  for (const sm of prunable) {
    if (currentTokens <= targetLimit) {
      break;
    }
    prunedIds.add(sm.index);
    // Estimate tokens saved
    const savedEstimate = tokenCountWithEstimation([sm.msg]);
    currentTokens -= savedEstimate;
    logForDebugging(
      `[KiloCompact] Pruned message at index ${sm.index} with score ${sm.score} (saved ~${savedEstimate} tokens)`,
    );
  }

  return messages.filter((_, index) => !prunedIds.has(index));
}

/**
 * Main entrypoint for KiloCompact Engine.
 * Run all compaction pillars locally, instantly, and with zero API cost!
 */
export async function runKiloCompact(
  messages: Message[],
  options?: KiloCompactOptions,
): Promise<{
  compactedMessages: Message[];
  originalTokens: number;
  newTokens: number;
  wasCompacted: boolean;
}> {
  const originalTokens = tokenCountWithEstimation(messages);
  const target = options?.targetTokenLimit ?? 100_000;

  if (originalTokens <= target) {
    return {
      compactedMessages: messages,
      originalTokens,
      newTokens: originalTokens,
      wasCompacted: false,
    };
  }

  logForDebugging(`[KiloCompact] Starting Next-Gen Context Compaction. Tokens: ${originalTokens} -> Target: ${target}`);

  // Step 1: Deterministic AST & Regex Snipping on all tool outputs
  const snippedMessages = messages.map(msg => {
    if (msg.type === 'user' && Array.isArray(msg.content)) {
      const newContent = msg.content.map(block => {
        if (block.type === 'tool_result' && typeof block.content === 'string') {
          return {
            ...block,
            content: snipDeterministicBloat(block.content),
          };
        }
        return block;
      });
      return { ...msg, content: newContent };
    }
    return msg;
  });

  // Step 2: State Consolidation
  const consolidatedMessages = consolidateToolStates(snippedMessages);

  // Step 3: Semantic Pruning
  const compactedMessages = semanticPruneHistory(consolidatedMessages, target);

  const newTokens = tokenCountWithEstimation(compactedMessages);
  logForDebugging(
    `[KiloCompact] Compaction completed. Saved ${originalTokens - newTokens} tokens. New tokens: ${newTokens}`,
  );

  return {
    compactedMessages,
    originalTokens,
    newTokens,
    wasCompacted: newTokens < originalTokens,
  };
}
