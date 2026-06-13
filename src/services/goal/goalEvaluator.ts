/**
 * Goal evaluator — checks if a session goal's condition is met after each turn.
 *
 * Uses the configured small/fast model (defaults to Haiku for Anthropic, or the
 * provider's equivalent) to evaluate the goal condition against the conversation
 * transcript. The evaluator does NOT call tools — it only judges what Claude has
 * already surfaced in the conversation.
 *
 * Multi-provider: resolves the small model via getSmallFastModel() and uses the
 * unified AI provider client (AnthropicAdapter) so it works with any provider.
 */

import { getAIProviderClient } from '../../services/api/client.js';
import type { Message } from '../../types/message.js';
import { logForDebugging } from '../../utils/debug.js';
import { toError } from '../../utils/errors.js';
import { getSmallFastModel, renderModelName } from '../../utils/model/model.js';
import { ProviderManager } from '../ai/ProviderManager.js';
import { logEvent } from '../analytics/index.js';

export type GoalEvaluationResult = {
  /** Whether the goal condition is met */
  met: boolean;
  /** Short reason explaining why the condition is or isn't met */
  reason: string;
  /** Tokens used for the evaluation */
  inputTokens: number;
  outputTokens: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Model used for evaluation */
  model: string;
  /** Whether the goal is considered blocked */
  blocked?: boolean;
};

/**
 * Parse a goal condition for turn/time bound clauses.
 * Supports patterns like:
 *   "or stop after 20 turns"
 *   "or stop after 30 minutes"
 *   "or stop after 1 hour"
 */
export function parseGoalBounds(goal: string): {
  condition: string;
  maxTurns?: number;
  maxMinutes?: number;
} {
  // Match "or stop after N turns"
  const turnMatch = goal.match(/\bor\s+stop\s+after\s+(\d+)\s+turns?\b/i);
  // Match "or stop after N minutes"
  const minuteMatch = goal.match(/\bor\s+stop\s+after\s+(\d+)\s+minutes?\b/i);
  // Match "or stop after N hours?"
  const hourMatch = goal.match(/\bor\s+stop\s+after\s+(\d+(?:\.\d+)?)\s+hours?\b/i);

  let condition = goal;
  let maxTurns: number | undefined;
  let maxMinutes: number | undefined;

  if (turnMatch) {
    maxTurns = parseInt(turnMatch[1]!, 10);
    // Remove the clause from the condition for the evaluator
    condition = condition.replace(turnMatch[0]!, '').trim();
  }

  if (minuteMatch) {
    maxMinutes = parseInt(minuteMatch[1]!, 10);
    condition = condition.replace(minuteMatch[0]!, '').trim();
  }

  if (hourMatch) {
    maxMinutes = parseFloat(hourMatch[1]!) * 60;
    condition = condition.replace(hourMatch[0]!, '').trim();
  }

  // Clean up any trailing "or" or leading "and"
  condition = condition.replace(/\s*\bor\s*$/i, '').trim();
  condition = condition.replace(/^\s*and\s+/i, '').trim();

  return { condition, maxTurns, maxMinutes };
}

/**
 * Build the conversation transcript for the evaluator.
 * Only includes user and assistant messages (no system/meta messages).
 */
function buildTranscript(messages: Message[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    if (msg.type === 'user') {
      const text = extractMessageText(msg);
      if (text && !msg.isMeta) {
        lines.push(`<user>\n${text}\n</user>`);
      }
    } else if (msg.type === 'assistant') {
      const text = extractMessageText(msg);
      if (text) {
        lines.push(`<assistant>\n${text}\n</assistant>`);
      }
      // Include tool results as context
      if (msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_result') {
            const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
            // Truncate very long tool results
            const truncated = content.length > 2000 ? content.slice(0, 2000) + '\n...(truncated)' : content;
            lines.push(`<tool_result>\n${truncated}\n</tool_result>`);
          }
        }
      }
    }
  }
  return lines.join('\n\n');
}

function extractMessageText(msg: Message): string {
  if (msg.type === 'user' && typeof msg.content === 'string') {
    return msg.content;
  }
  if (msg.type === 'assistant' && msg.message?.content) {
    const texts: string[] = [];
    for (const block of msg.message.content) {
      if (block.type === 'text') {
        texts.push(block.text);
      }
    }
    return texts.join('\n');
  }
  return '';
}

/**
 * Evaluate whether a goal condition is met based on the conversation.
 *
 * The evaluator runs on the configured small/fast model and does not call tools.
 * It judges the condition against what Claude has already surfaced in the conversation.
 */
export async function evaluateGoal(
  goalCondition: string,
  messages: Message[],
  turnCount: number,
  startTime: number,
  maxTurns?: number,
  maxMinutes?: number,
): Promise<GoalEvaluationResult> {
  const evalStart = Date.now();
  const model = getSmallFastModel();
  const providerManager = ProviderManager.getInstance();
  const provider = providerManager.getActiveProviderName() || 'anthropic';

  // Check turn/time bounds first (deterministic, no model call needed)
  if (maxTurns !== undefined && turnCount >= maxTurns) {
    return {
      met: true,
      reason: `Turn limit reached: ${turnCount}/${maxTurns} turns`,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - evalStart,
      model,
    };
  }

  if (maxMinutes !== undefined) {
    const elapsedMinutes = (Date.now() - startTime) / 60_000;
    if (elapsedMinutes >= maxMinutes) {
      return {
        met: true,
        reason: `Time limit reached: ${Math.round(elapsedMinutes)}/${maxMinutes} minutes`,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - evalStart,
        model,
      };
    }
  }

  const transcript = buildTranscript(messages);

  const systemPrompt = `You are a goal evaluator for an AI coding assistant. Your job is to determine whether the user's goal condition has been met based on the conversation transcript.

Rules:
1. Only judge based on what is visible in the transcript — do not assume actions were taken if they are not shown.
2. Be strict: if the condition requires tests to pass, you must see actual test output showing they pass.
3. If the condition is ambiguous, return met=false with a reason explaining what's unclear.
4. Return your decision as a JSON object with "met" (boolean) and "reason" (string).
5. The reason should be brief (1-2 sentences) and explain why the condition is or isn't met.
6. If the transcript shows the goal is fully achieved, return met=true.
7. If work is in progress but incomplete, return met=false with what remains to be done.`;

  const userPrompt = `Goal condition: "${goalCondition}"

Conversation transcript:
${transcript}

Has the goal condition been met? Return your decision as JSON: {"met": true/false, "reason": "..."}`;

  try {
    const client = await getAIProviderClient({
      provider: provider as any,
      maxRetries: 2,
      model,
    });

    const response = await (client as any).beta.messages.create({
      model,
      max_tokens: 256,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const durationMs = Date.now() - evalStart;
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;

    // Parse the response
    let met = false;
    let reason = 'Could not parse evaluator response';

    const content = response.content;
    if (Array.isArray(content)) {
      const textBlock = content.find((b: any) => b.type === 'text');
      if (textBlock?.text) {
        try {
          // Try to extract JSON from the response
          const jsonMatch = textBlock.text.match(/\{[\s\S]*"met"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            met = Boolean(parsed.met);
            reason = parsed.reason || reason;
          } else {
            // Fallback: look for yes/no patterns
            const lower = textBlock.text.toLowerCase();
            if (lower.includes('"met": true') || lower.includes('"met":true')) {
              met = true;
              reason = textBlock.text.slice(0, 200);
            }
          }
        } catch {
          reason = textBlock.text.slice(0, 200);
        }
      }
    } else if (typeof content === 'string') {
      try {
        const jsonMatch = content.match(/\{[\s\S]*"met"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          met = Boolean(parsed.met);
          reason = parsed.reason || reason;
        }
      } catch {
        reason = content.slice(0, 200);
      }
    }

    logEvent('tengu_goal_evaluation', {
      met,
      inputTokens,
      outputTokens,
      durationMs,
    });

    return { met, reason, inputTokens, outputTokens, durationMs, model };
  } catch (error) {
    const durationMs = Date.now() - evalStart;
    const err = toError(error);
    logForDebugging(`[goal] evaluator error: ${err.message}`, { level: 'error' });

    logEvent('tengu_goal_evaluation_error', {
      durationMs,
    });

    // On error, return "not met" so the loop continues (safer than stopping)
    return {
      met: false,
      reason: `Evaluator error: ${err.message.slice(0, 100)}`,
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
      model,
    };
  }
}
