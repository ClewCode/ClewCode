import type { ContentBlockParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs';
import type { UUID } from 'crypto';
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js';
import { findToolByName, type ToolUseContext } from '../../Tool.js';
import type { AssistantMessage, Message } from '../../types/message.js';
import { all } from '../../utils/generators.js';
import { createUserMessage } from '../../utils/messages.js';
import { type PlannedCall, planToolCalls, REFUSAL_MESSAGE } from './toolCallDedup.js';
import { type MessageUpdateLazy, runToolUse } from './toolExecution.js';

function getMaxToolUseConcurrency(): number {
  return parseInt(process.env.CLEW_CODE_MAX_TOOL_USE_CONCURRENCY || '', 10) || 10;
}

export type MessageUpdate = {
  message?: Message;
  newContext: ToolUseContext;
};

export async function* runTools(
  toolUseMessages: ToolUseBlock[],
  assistantMessages: AssistantMessage[],
  canUseTool: CanUseToolFn,
  toolUseContext: ToolUseContext,
): AsyncGenerator<MessageUpdate, void> {
  let currentContext = toolUseContext;

  const planned = planToolCalls(toolUseMessages, toolUseContext.messages);
  // Refused calls never reach a tool; duplicates are answered from the original's
  // result. Only the rest are actually executed.
  const refused = planned.filter(p => !p.duplicateOf && p.verdict.action === 'refuse');
  const duplicates = planned.filter(p => p.duplicateOf !== undefined);
  const toExecute = planned.filter(p => !p.duplicateOf && p.verdict.action !== 'refuse');
  const reminderByToolUseId = new Map(
    planned.filter(p => p.verdict.reminder).map(p => [p.block.id, p.verdict.reminder!] as const),
  );
  /** Result content of each executed call, so its same-turn duplicates can copy it. */
  const resultByToolUseId = new Map<string, ContentBlockParam[]>();

  for (const call of refused) {
    yield {
      message: refusalMessage(call, assistantMessages),
      newContext: currentContext,
    };
  }

  for (const { isConcurrencySafe, blocks } of partitionToolCalls(
    toExecute.map(p => p.block),
    currentContext,
  )) {
    if (isConcurrencySafe) {
      const queuedContextModifiers: Record<string, ((context: ToolUseContext) => ToolUseContext)[]> = {};
      // Run read-only batch concurrently
      for await (const update of runToolsConcurrently(blocks, assistantMessages, canUseTool, currentContext)) {
        if (update.contextModifier) {
          const { toolUseID, modifyContext } = update.contextModifier;
          if (!queuedContextModifiers[toolUseID]) {
            queuedContextModifiers[toolUseID] = [];
          }
          queuedContextModifiers[toolUseID].push(modifyContext);
        }
        yield {
          message: interceptResult(update.message, reminderByToolUseId, resultByToolUseId),
          newContext: currentContext,
        };
      }
      for (const block of blocks) {
        const modifiers = queuedContextModifiers[block.id];
        if (!modifiers) {
          continue;
        }
        for (const modifier of modifiers) {
          currentContext = modifier(currentContext);
        }
      }
      yield { newContext: currentContext };
    } else {
      // Run non-read-only batch serially
      for await (const update of runToolsSerially(blocks, assistantMessages, canUseTool, currentContext)) {
        if (update.newContext) {
          currentContext = update.newContext;
        }
        yield {
          message: interceptResult(update.message, reminderByToolUseId, resultByToolUseId),
          newContext: currentContext,
        };
      }
    }
  }

  // Same-turn duplicates: replay the original's result under the duplicate's id.
  // Emitted after execution so the original's result is always available — the
  // API pairs results with calls by tool_use_id, not by order.
  for (const call of duplicates) {
    const original = resultByToolUseId.get(call.duplicateOf!);
    yield {
      message: original
        ? createUserMessage({
            content: retargetToolResults(original, call.duplicateOf!, call.block.id),
            sourceToolAssistantUUID: sourceAssistantUuid(call, assistantMessages),
          })
        : // The original produced no result (aborted, or it errored out before
          // emitting one). Say so rather than leaving the call unanswered.
          toolResultMessage(call, assistantMessages, 'The identical call in this turn produced no result.', true),
      newContext: currentContext,
    };
  }
}

/** The assistant message that issued a call, needed to anchor the result in the transcript. */
function sourceAssistantUuid(call: PlannedCall, assistantMessages: AssistantMessage[]): UUID | undefined {
  // AssistantMessage types uuid as a plain string while createUserMessage wants
  // the branded UUID; the values are the same randomUUID() output either way.
  return assistantMessages.find(m => m.message.content.some(c => c.type === 'tool_use' && c.id === call.block.id))
    ?.uuid as UUID | undefined;
}

/** A synthetic tool result for a call that was never handed to a tool. */
function toolResultMessage(
  call: PlannedCall,
  assistantMessages: AssistantMessage[],
  text: string,
  isError: boolean,
): Message {
  return createUserMessage({
    content: [{ type: 'tool_result', content: text, is_error: isError, tool_use_id: call.block.id }],
    toolUseResult: isError ? `Error: ${text}` : text,
    sourceToolAssistantUUID: sourceAssistantUuid(call, assistantMessages),
  });
}

function refusalMessage(call: PlannedCall, assistantMessages: AssistantMessage[]): Message {
  return toolResultMessage(call, assistantMessages, REFUSAL_MESSAGE, true);
}

/** Copy result blocks, re-pointing the tool_result at a different call's id. Exported for tests. */
export function retargetToolResults(content: ContentBlockParam[], fromId: string, toId: string): ContentBlockParam[] {
  return content.map(block =>
    block.type === 'tool_result' && block.tool_use_id === fromId ? { ...block, tool_use_id: toId } : block,
  );
}

/**
 * Append a pending repeat reminder to a tool result as it streams past, and
 * record the result so this turn's duplicates can copy it.
 *
 * Only tool_result blocks are touched; progress and other message types pass
 * through untouched.
 */
export function interceptResult(
  message: Message | undefined,
  reminderByToolUseId: Map<string, string>,
  resultByToolUseId: Map<string, ContentBlockParam[]>,
): Message | undefined {
  if (message?.type !== 'user' || typeof message.message.content === 'string') {
    return message;
  }
  const content = message.message.content;
  const toolUseId = content.find(block => block.type === 'tool_result')?.tool_use_id;
  if (toolUseId === undefined) {
    return message;
  }

  const reminder = reminderByToolUseId.get(toolUseId);
  const finalContent = reminder ? content.map(block => appendToToolResult(block, reminder)) : content;
  // Recorded post-reminder so a duplicate sees exactly what the original saw.
  resultByToolUseId.set(toolUseId, finalContent);
  if (!reminder) {
    return message;
  }
  reminderByToolUseId.delete(toolUseId);
  return {
    ...message,
    message: { ...message.message, content: finalContent },
  };
}

/** Append text inside a tool_result, handling both its string and block-list forms. */
function appendToToolResult(block: ContentBlockParam, text: string): ContentBlockParam {
  if (block.type !== 'tool_result') {
    return block;
  }
  if (typeof block.content === 'string') {
    return { ...block, content: block.content + text };
  }
  if (!Array.isArray(block.content)) {
    return { ...block, content: text };
  }
  const parts = [...block.content];
  const last = parts.at(-1);
  if (last?.type === 'text') {
    parts[parts.length - 1] = { ...last, text: last.text + text };
  } else {
    parts.push({ type: 'text', text });
  }
  return { ...block, content: parts };
}

type Batch = { isConcurrencySafe: boolean; blocks: ToolUseBlock[] };

/**
 * Partition tool calls into batches where each batch is either:
 * 1. A single non-read-only tool, or
 * 2. Multiple consecutive read-only tools
 */
function partitionToolCalls(toolUseMessages: ToolUseBlock[], toolUseContext: ToolUseContext): Batch[] {
  return toolUseMessages.reduce((acc: Batch[], toolUse) => {
    const tool = findToolByName(toolUseContext.options.tools, toolUse.name);
    const parsedInput = tool?.inputSchema.safeParse(toolUse.input);
    const isConcurrencySafe = parsedInput?.success
      ? (() => {
          try {
            return Boolean(tool?.isConcurrencySafe(parsedInput.data));
          } catch {
            // If isConcurrencySafe throws (e.g., due to shell-quote parse failure),
            // treat as not concurrency-safe to be conservative
            return false;
          }
        })()
      : false;
    if (isConcurrencySafe && acc[acc.length - 1]?.isConcurrencySafe) {
      acc[acc.length - 1]!.blocks.push(toolUse);
    } else {
      acc.push({ isConcurrencySafe, blocks: [toolUse] });
    }
    return acc;
  }, []);
}

async function* runToolsSerially(
  toolUseMessages: ToolUseBlock[],
  assistantMessages: AssistantMessage[],
  canUseTool: CanUseToolFn,
  toolUseContext: ToolUseContext,
): AsyncGenerator<MessageUpdate, void> {
  let currentContext = toolUseContext;

  for (const toolUse of toolUseMessages) {
    toolUseContext.setInProgressToolUseIDs(prev => new Set(prev).add(toolUse.id));
    for await (const update of runToolUse(
      toolUse,
      assistantMessages.find(_ => _.message.content.some(_ => _.type === 'tool_use' && _.id === toolUse.id))!,
      canUseTool,
      currentContext,
    )) {
      if (update.contextModifier) {
        currentContext = update.contextModifier.modifyContext(currentContext);
      }
      yield {
        message: update.message,
        newContext: currentContext,
      };
    }
    markToolUseAsComplete(toolUseContext, toolUse.id);
  }
}

async function* runToolsConcurrently(
  toolUseMessages: ToolUseBlock[],
  assistantMessages: AssistantMessage[],
  canUseTool: CanUseToolFn,
  toolUseContext: ToolUseContext,
): AsyncGenerator<MessageUpdateLazy, void> {
  yield* all(
    toolUseMessages.map(async function* (toolUse) {
      toolUseContext.setInProgressToolUseIDs(prev => new Set(prev).add(toolUse.id));
      yield* runToolUse(
        toolUse,
        assistantMessages.find(_ => _.message.content.some(_ => _.type === 'tool_use' && _.id === toolUse.id))!,
        canUseTool,
        toolUseContext,
      );
      markToolUseAsComplete(toolUseContext, toolUse.id);
    }),
    getMaxToolUseConcurrency(),
  );
}

function markToolUseAsComplete(toolUseContext: ToolUseContext, toolUseID: string) {
  toolUseContext.setInProgressToolUseIDs(prev => {
    const next = new Set(prev);
    next.delete(toolUseID);
    return next;
  });
}
