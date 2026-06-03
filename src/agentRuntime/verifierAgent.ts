/**
 * Verifier / Refuter Agent
 *
 * Implements the "adversarial verification" half of dynamic workflows
 * (Anthropic announcement, May 2026): independent agents try to break
 * or refute a finding produced by a coder/researcher before its result
 * is folded into the final answer.
 *
 * The verifier is a pure function over (systemPrompt, targetArtifact)
 * plus a pluggable LLM caller, mirroring the planner's design. The host
 * wires it to the active provider so the same code works for Anthropic,
 * OpenAI, Gemini, OpenRouter, etc.
 *
 * The verdict is a small structured object so the orchestrator can decide
 * whether to accept the result, send it to a `fixer`, or escalate to a
 * human.
 */

import type { PlannerLlm } from './dynamicWorkflow.js';

export type VerifierVerdict =
  | { status: 'confirmed'; reason: string }
  | { status: 'refuted'; reason: string; suggestedFix?: string }
  | { status: 'inconclusive'; reason: string; needsMoreInfo?: string };

const VERIFIER_SYSTEM_PROMPT = `You are the Adversarial Verifier for Clew (a Claude Code-compatible CLI).

Your job: critically examine a finding produced by another agent and try to break it. You are NOT a rubber-stamp — your value is in finding holes.

The finding you are reviewing may be:
- A factual claim (e.g. "this function is the bottleneck" or "auth is missing on route X")
- A code change (a diff or patch)
- A bug report (a defect and its root cause)

For each finding, attempt to refute it by considering:
1. Is the premise even correct? Could the author have misread the code?
2. Are there counterexamples? Edge cases that would invalidate the claim?
3. Is the evidence (cited files, line numbers, tests) accurate?
4. If it's a fix: does the patch actually solve the stated problem without regressions?
5. If it's a security claim: can you construct an exploit that bypasses the fix?
6. If it's a migration: does the new code preserve the old behavior on the documented happy path?

Respond with ONLY valid JSON of this exact shape:

{
  "status": "confirmed" | "refuted" | "inconclusive",
  "reason": "Concise explanation of why the finding holds or fails",
  "suggestedFix": "If refuted, a one-paragraph suggested fix. Omit otherwise.",
  "needsMoreInfo": "If inconclusive, what additional evidence would resolve it. Omit otherwise."
}

Hard rules:
- "confirmed" means you tried and failed to refute the finding.
- "refuted" requires a concrete reason and ideally a suggested fix.
- Be honest: if the finding is plausible but you cannot validate it, say
  "inconclusive" rather than guessing. False refutations are worse than no
  verdict.
- Do not invent code that does not exist in the cited files.
- Respond with JSON only. No prose, no markdown fences.`;

/**
 * Run an adversarial verification on a target artifact.
 */
export async function verifyFinding(params: {
  finding: string;
  context: string;
  llm: PlannerLlm;
  maxTokens?: number;
}): Promise<VerifierVerdict> {
  const userPrompt = [
    '## Finding under review',
    params.finding,
    '',
    '## Context (sibling artifacts, citations, prior steps)',
    params.context || '(none provided)',
    '',
    'Adversarially verify the finding. Respond with JSON only.',
  ].join('\n');

  const text = await params.llm({
    systemPrompt: VERIFIER_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: params.maxTokens ?? 1024,
  });

  return parseVerifierJson(text);
}

function parseVerifierJson(text: string): VerifierVerdict {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return { status: 'inconclusive', reason: 'Verifier returned non-JSON output' };
    }
    try {
      obj = JSON.parse(match[0]);
    } catch {
      return { status: 'inconclusive', reason: 'Verifier returned malformed JSON' };
    }
  }
  if (!obj || typeof obj !== 'object') {
    return { status: 'inconclusive', reason: 'Verifier returned a non-object' };
  }
  const v = obj as { status?: string; reason?: string; suggestedFix?: string; needsMoreInfo?: string };
  if (v.status === 'confirmed' && typeof v.reason === 'string') {
    return { status: 'confirmed', reason: v.reason };
  }
  if (v.status === 'refuted' && typeof v.reason === 'string') {
    return {
      status: 'refuted',
      reason: v.reason,
      suggestedFix: typeof v.suggestedFix === 'string' ? v.suggestedFix : undefined,
    };
  }
  if (v.status === 'inconclusive' && typeof v.reason === 'string') {
    return {
      status: 'inconclusive',
      reason: v.reason,
      needsMoreInfo: typeof v.needsMoreInfo === 'string' ? v.needsMoreInfo : undefined,
    };
  }
  return { status: 'inconclusive', reason: 'Verifier returned an unrecognized verdict' };
}
