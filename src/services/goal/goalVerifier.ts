/**
 * Goal Verifier — independent evaluation when agent attempts termination.
 *
 * When the agent tries to declare "done", this fires an independent LLM call
 * to review the conversation vs the goal text. If the goal isn't satisfied,
 * it feeds back the specific gap so the agent can continue.
 *
 * Inspired by MiMo Code's Goal mechanism: the verifier does not participate
 * in actual work, so it doesn't develop alignment bias toward completed parts.
 * Each call gets the same context as the agent, including actual tool outputs.
 */

import type { CanUseToolFn } from '../../hooks/useCanUseTool.js';
import type { Message } from '../../types/message.js';
import { type CacheSafeParams, runForkedAgent } from '../../utils/forkedAgent.js';
import { createUserMessage, getLastAssistantMessage, getAssistantMessageText } from '../../utils/messages.js';

export type VerificationResult = {
  isComplete: boolean;
  gap?: string;
  isImpossible?: boolean;
};

const VERIFICATION_PROMPT = `You are a goal verifier. Your job is to review the conversation history and determine whether the task goal has been fully satisfied.

Rules:
1. Be thorough — check that ALL aspects of the goal are met, not just the obvious parts
2. Look at actual tool outputs (test results, file contents, error logs) — don't just trust the agent's claims
3. If the goal is partially met, describe specifically what's missing
4. If the goal cannot be achieved (e.g., the approach is fundamentally flawed), say so
5. If the goal IS complete, simply say "GOAL COMPLETE"

Output format (use exactly these markers):
- GOAL COMPLETE — if and only if every aspect of the goal is satisfied
- GAP: <specific description of what's missing> — if the goal is not yet met
- IMPOSSIBLE: <reason> — if the goal cannot be achieved`;

/**
 * Verify whether a goal has been completed based on conversation history.
 * Returns the verification result synchronously (blocks the main loop briefly).
 */
export async function verifyGoalCompletion(
  goalText: string,
  messages: Message[],
  canUseTool: CanUseToolFn,
  cacheSafeParams: CacheSafeParams,
): Promise<VerificationResult> {
  try {
    const result = await runForkedAgent({
      promptMessages: [
        createUserMessage({
          content: `## Task Goal\n${goalText}\n\n## Instructions\n${VERIFICATION_PROMPT}`,
        }),
      ],
      cacheSafeParams,
      canUseTool: async () => ({
        behavior: 'deny' as const,
        message: 'Verifier does not use tools',
        decisionReason: { type: 'other' as const, reason: 'verifier only reads context' },
      }),
      querySource: 'goal-verifier' as import('../../constants/querySource.js').QuerySource,
      forkLabel: 'goal-verifier',
      maxTurns: 1,
    });

    const lastAssistant = getLastAssistantMessage(result.messages);
    const text = lastAssistant ? getAssistantMessageText(lastAssistant) : '';

    if (!text) {
      return { isComplete: false, gap: 'Verifier produced no output' };
    }

    if (text.includes('GOAL COMPLETE')) {
      return { isComplete: true };
    }

    const gapMatch = text.match(/GAP:\s*(.+?)(?:\n|$)/);
    const impossibleMatch = text.match(/IMPOSSIBLE:\s*(.+?)(?:\n|$)/);

    return {
      isComplete: false,
      gap: gapMatch?.[1]?.trim(),
      isImpossible: !!impossibleMatch?.[1],
      ...(impossibleMatch?.[1] ? { isImpossible: true, gap: impossibleMatch[1].trim() } : {}),
    };
  } catch {
    // Verifier failure is non-fatal — allow normal termination
    return { isComplete: true };
  }
}
