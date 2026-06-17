/**
 * Max Mode — parallel candidate selection.
 *
 * When enabled, generates N parallel candidates (default 3) for each turn:
 * 1. Spawns N worker sessions via forked agents
 * 2. Each worker gets the same prompt but different temperature/strategy
 * 3. Collects all candidate responses
 * 4. Uses evaluator to select best candidate
 * 5. Returns the winning candidate to the main session
 *
 * Reuses existing forkedAgent infrastructure and goalEvaluator pattern.
 */

import { randomUUID } from 'crypto';
import type { QuerySource } from '../../constants/querySource.js';
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js';
import type { AssistantMessage, Message } from '../../types/message.js';
import { type CacheSafeParams, runForkedAgent } from '../../utils/forkedAgent.js';
import { createUserMessage } from '../../utils/messages.js';

const DEFAULT_NUM_CANDIDATES = 3;
const MAX_NUM_CANDIDATES = 5;

export type CandidateResult = {
  id: string;
  candidateIndex: number;
  response: string;
  durationMs: number;
  toolCalls: number;
  tokens: number;
};

export type MaxModeConfig = {
  enabled: boolean;
  numCandidates: number; // 1-5, default 3
  strategy: 'parallel' | 'best-of-n';
};

const maxModeConfig: MaxModeConfig = {
  enabled: false,
  numCandidates: DEFAULT_NUM_CANDIDATES,
  strategy: 'best-of-n',
};

/**
 * Get current max mode configuration.
 */
export function getMaxModeConfig(): MaxModeConfig {
  return { ...maxModeConfig };
}

/**
 * Toggle max mode on/off.
 */
export function setMaxModeEnabled(enabled: boolean): void {
  maxModeConfig.enabled = enabled;
}

/**
 * Set number of candidates (1-5).
 */
export function setNumCandidates(num: number): void {
  maxModeConfig.numCandidates = Math.max(1, Math.min(MAX_NUM_CANDIDATES, num));
}

/**
 * Run parallel candidates and return the best one.
 *
 * @param prompt - The user prompt to send to all candidates
 * @param messages - Current conversation messages
 * @param canUseTool - Permission check function
 * @param cacheSafeParams - Cache-safe parameters for forked agents
 * @returns The best candidate result, or null if max mode is disabled
 */
export async function runMaxMode(
  prompt: string,
  messages: Message[],
  canUseTool: CanUseToolFn,
  cacheSafeParams: CacheSafeParams,
): Promise<CandidateResult | null> {
  if (!maxModeConfig.enabled) return null;

  const numCandidates = maxModeConfig.numCandidates;
  const userMessage = createUserMessage({ content: prompt }) as unknown as Message;

  // Spawn all candidates in parallel
  const startTime = Date.now();
  const candidatePromises: Promise<CandidateResult>[] = [];

  for (let i = 0; i < numCandidates; i++) {
    candidatePromises.push(runCandidate(i, [...messages, userMessage], canUseTool, cacheSafeParams));
  }

  // Wait for all candidates to complete
  const results = await Promise.allSettled(candidatePromises);

  // Filter successful results
  const successfulResults: CandidateResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      successfulResults.push(result.value);
    }
  }

  if (successfulResults.length === 0) {
    return null;
  }

  // Select best candidate — LLM judge if >1 candidate, with heuristic fallback
  const bestCandidate =
    successfulResults.length > 1
      ? ((await judgeCandidates(prompt, successfulResults, cacheSafeParams)) ?? selectBestCandidate(successfulResults))
      : successfulResults[0]!;

  const totalDuration = Date.now() - startTime;
  console.log(
    `[max-mode] ${successfulResults.length} candidates completed in ${totalDuration}ms. Winner: candidate #${bestCandidate.candidateIndex}`,
  );

  return bestCandidate;
}

/**
 * Run a single candidate.
 */
async function runCandidate(
  index: number,
  messages: Message[],
  canUseTool: CanUseToolFn,
  cacheSafeParams: CacheSafeParams,
): Promise<CandidateResult> {
  const startTime = Date.now();
  const candidateId = `candidate-${index}-${randomUUID().slice(0, 8)}`;

  try {
    // Run forked agent
    const result = await runForkedAgent({
      promptMessages: messages,
      cacheSafeParams,
      canUseTool,
      querySource: 'maxmode-candidate' as QuerySource,
      forkLabel: `candidate-${index}`,
      maxTurns: 10,
    });

    // Extract response text
    const lastAssistant = result.messages.findLast(m => m.type === 'assistant') as unknown as
      | AssistantMessage
      | undefined;
    const responseText = lastAssistant ? extractTextFromAssistant(lastAssistant) : '';

    const durationMs = Date.now() - startTime;

    return {
      id: candidateId,
      candidateIndex: index,
      response: responseText,
      durationMs,
      toolCalls: result.messages.filter(m => {
        if (m.type === 'assistant' && 'message' in m) {
          const assistantMsg = m as unknown as AssistantMessage;
          const content = (assistantMsg.message as { content?: unknown })?.content;
          return Array.isArray(content) && content.some((b: { type: string }) => b.type === 'tool_use');
        }
        return false;
      }).length,
      tokens: result.totalUsage.inputTokens + result.totalUsage.outputTokens,
    };
  } catch {
    // Candidate failed, return empty result
    return {
      id: candidateId,
      candidateIndex: index,
      response: '',
      durationMs: Date.now() - startTime,
      toolCalls: 0,
      tokens: 0,
    };
  }
}

const JUDGE_PROMPT = `You are a judge evaluating candidate responses to a user's request.
Compare the following candidates and select the best one.

Criteria:
- Completeness: does it fully address the user's request?
- Correctness: is the reasoning sound and the approach valid?
- Clarity: is the response well-structured and actionable?
- Tool usage: did it use appropriate tools effectively?

Output exactly: CANDIDATE: <number>
Where <number> is the index of the best candidate (0-based).`;

/**
 * Use an LLM judge to select the best candidate.
 * Falls back to null on failure — caller uses heuristic.
 */
async function judgeCandidates(
  prompt: string,
  results: CandidateResult[],
  cacheSafeParams: CacheSafeParams,
): Promise<CandidateResult | null> {
  const candidatesText = results.map((r, i) => `--- Candidate ${i} ---\n${r.response.slice(0, 8000)}`).join('\n\n');

  const judgeMessage = createUserMessage({
    content: `## User Request\n${prompt}\n\n## Candidates\n${candidatesText}\n\n## Evaluation\n${JUDGE_PROMPT}`,
  });

  try {
    const result = await runForkedAgent({
      promptMessages: [judgeMessage],
      cacheSafeParams,
      canUseTool: async () => ({
        behavior: 'deny',
        message: 'Judge does not use tools',
        decisionReason: { type: 'other', reason: 'judge only evaluates responses' },
      }),
      querySource: 'maxmode-judge' as QuerySource,
      forkLabel: 'maxmode-judge',
      maxTurns: 1,
    });

    const lastAssistant = result.messages.findLast((m): m is AssistantMessage => m.type === 'assistant');
    if (!lastAssistant) return null;

    const text = extractTextFromAssistant(lastAssistant);
    const match = text.match(/CANDIDATE:\s*(\d+)/);
    if (!match) return null;

    const idx = parseInt(match[1]!, 10);
    return results[idx] ?? null;
  } catch {
    return null; // fallback to heuristic
  }
}

/**
 * Heuristic fallback: score candidates by tool calls, length, speed.
 */
function selectBestCandidate(results: CandidateResult[]): CandidateResult {
  if (results.length === 1) return results[0]!;
  const scored = results.map(r => ({ ...r, score: scoreCandidate(r) }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!;
}

function scoreCandidate(result: CandidateResult): number {
  let score = 0;
  score += result.toolCalls * 10;
  score += Math.min(result.response.length / 100, 50);
  if (result.durationMs > 60_000) score -= 5;
  if (result.tokens > 0) score += 10;
  return score;
}

/**
 * Extract text content from an assistant message.
 */
function extractTextFromAssistant(message: AssistantMessage): string {
  const msgObj = message.message as { content?: unknown } | undefined;
  const content = msgObj?.content;
  if (!Array.isArray(content)) return '';

  return content
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { type: string; text: string }) => block.text)
    .join('\n');
}
