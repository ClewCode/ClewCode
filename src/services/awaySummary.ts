import { APIUserAbortError } from '@anthropic-ai/sdk';
import { getEmptyToolPermissionContext } from '../Tool.js';
import type { Message } from '../types/message.js';
import { logForDebugging } from '../utils/debug.js';
import { createUserMessage, getAssistantMessageText } from '../utils/messages.js';
import { getMainLoopModel, getSmallFastModel } from '../utils/model/model.js';
import { asSystemPrompt } from '../utils/systemPromptType.js';
import { queryModelWithoutStreaming } from './api/claude.js';
import { getSessionMemoryContent } from './SessionMemory/sessionMemoryUtils.js';

// Recap only needs recent context. Truncate to avoid "prompt too long" on
// large sessions. 30 messages is roughly 15 exchanges, plenty for handoff.
const RECENT_MESSAGE_WINDOW = 30;

function buildAwaySummaryPrompt(memory: string | null): string {
  const memoryBlock = memory ? `Session memory (broader context):\n${memory}\n\n` : '';
  return `${memoryBlock}The user stepped away and is coming back. Write a tiny handoff recap in the same language the user has been using. Output exactly this shape and nothing else:

Goal: <what they are trying to accomplish at a high level>. Next: <the concrete next action>.

Keep it to one or two short sentences total. Avoid markdown, bullets, status reports, commit recaps, and implementation trivia.`;
}

function cleanAwaySummary(text: string): string {
  return text
    .trim()
    .replace(/^recap:\s*/i, '')
    .replace(/^summary:\s*/i, '')
    .replace(/\s+/g, ' ');
}

/**
 * Whether these messages contain an actual exchange worth recapping.
 *
 * `messages.length > 0` is not the same question. A session that has not been
 * talked to yet still carries attachments (CLAUDE.md, directory context),
 * meta user messages and system entries, so a bare length check let the recap
 * fire on a session with no conversation in it — producing a "Goal: ... Next:
 * ..." handoff for work that never happened.
 *
 * Requires both sides: a real user turn (not meta, not a tool_result carrier,
 * not a compact summary) and an assistant reply to it.
 */
export function hasRecappableConversation(messages: readonly Message[]): boolean {
  let hasUserTurn = false;
  let hasAssistantReply = false;
  for (const m of messages) {
    if (m.type === 'user') {
      const um = m as { isMeta?: boolean; toolUseResult?: unknown; isCompactSummary?: boolean };
      if (!um.isMeta && !um.toolUseResult && !um.isCompactSummary) hasUserTurn = true;
    } else if (m.type === 'assistant') {
      hasAssistantReply = true;
    }
    if (hasUserTurn && hasAssistantReply) return true;
  }
  return false;
}

/**
 * Generates a short session recap for the "while you were away" line.
 * Returns null on abort, empty transcript, or error.
 */
export async function generateAwaySummary(messages: readonly Message[], signal: AbortSignal): Promise<string | null> {
  if (!hasRecappableConversation(messages)) {
    return null;
  }

  try {
    const memory = await getSessionMemoryContent();
    const recent = messages.slice(-RECENT_MESSAGE_WINDOW);
    recent.push(createUserMessage({ content: buildAwaySummaryPrompt(memory) }));

    const runWithModel = async (model: string) =>
      queryModelWithoutStreaming({
        messages: recent,
        systemPrompt: asSystemPrompt([]),
        thinkingConfig: { type: 'disabled' },
        tools: [],
        signal,
        options: {
          getToolPermissionContext: async () => getEmptyToolPermissionContext(),
          model,
          toolChoice: undefined,
          isNonInteractiveSession: false,
          hasAppendSystemPrompt: false,
          agents: [],
          querySource: 'away_summary',
          mcpTools: [],
          skipCacheWrite: true,
        },
      });

    // Try the small/fast model first. If it errors (e.g. the provider has no
    // usable small model, or a free tier rejects the id), fall back to the
    // main-loop model — the one we already know works this session — so the
    // recap doesn't silently produce nothing.
    const smallModel = getSmallFastModel();
    const mainModel = getMainLoopModel();
    let response = await runWithModel(smallModel);

    if (response.isApiErrorMessage) {
      logForDebugging(`[awaySummary] small-fast model error: ${getAssistantMessageText(response)}`);
      if (!signal.aborted && mainModel !== smallModel) {
        response = await runWithModel(mainModel);
      }
    }

    if (response.isApiErrorMessage) {
      logForDebugging(`[awaySummary] API error: ${getAssistantMessageText(response)}`);
      return null;
    }

    const text = cleanAwaySummary(getAssistantMessageText(response) ?? '');
    return text.length > 0 ? text : null;
  } catch (err) {
    if (err instanceof APIUserAbortError || signal.aborted) {
      return null;
    }
    logForDebugging(`[awaySummary] generation failed: ${err}`);
    return null;
  }
}
