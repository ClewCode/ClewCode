/**
 * Guardian Evaluator — LLM-based auto-review for permission requests.
 *
 * When permission mode is `guardian`, boundary-crossing actions are routed
 * to this evaluator instead of pausing for the user. The evaluator is a
 * small model (Haiku-class) that sees a compact transcript + action request
 * + policy rules and returns allow/deny with a rationale.
 */

import { sideQuery } from '../sideQuery.js';
import { getSmallFastModel } from '../model/model.js';

export type GuardianVerdict = {
  allow: boolean;
  reason: string;
};

export type GuardianEvalParams = {
  toolName: string;
  toolInput: string;
  workspaceRoot: string;
  turnContext: string;
  policy?: string;
  signal?: AbortSignal;
};

const DEFAULT_POLICY = `Guardian Auto-Review Policy

1. ALLOW file edits within workspace directories
2. ALLOW common dev commands (npm, pnpm, git add/commit, bun, cargo, python, node)
3. ALLOW reading files in the workspace
4. ALLOW grep, find, ls, cat, head, tail for code exploration
5. DENY destructive ops: rm -rf, git reset --hard, git clean -fd, git push --force
6. DENY reading .env, credentials, keys, tokens, secrets
7. DENY sending data to external URLs (WebFetch, curl, wget to unknown domains)
8. DENY modifying system files outside workspace
9. DENY installing suspicious packages or running arbitrary downloaded code
10. When uncertain, DENY with "requires human review"`;

const GUARDIAN_SYSTEM_PROMPT = `You are the Guardian auto-review agent for a coding assistant.
Your job: evaluate whether a requested action should be allowed or denied.

For each request, consider:
1. Does this match an explicit ALLOW rule in the policy?
2. Does this match an explicit DENY rule in the policy?
3. Could this leak sensitive data (credentials, tokens, private keys)?
4. Could this cause irreversible damage (data loss, security holes)?
5. Is the action within workspace scope?

Respond with ONLY valid JSON: {"allow": true/false, "reason": "concise explanation"}

- "allow": true means the action is safe
- "allow": false means block it (explain why)
- If uncertain, deny with "requires human review"`;

export async function evaluateGuardian(params: GuardianEvalParams): Promise<GuardianVerdict> {
  const {
    toolName,
    toolInput,
    turnContext,
    policy,
    signal,
  } = params;

  const policyText = policy || DEFAULT_POLICY;
  const truncatedContext = turnContext.slice(0, 2000);
  const truncatedInput = toolInput.slice(0, 2000);

  const userPrompt = [
    '## Policy',
    policyText,
    '',
    '## Turn Context',
    truncatedContext || '(none)',
    '',
    '## Requested Action',
    `Tool: ${toolName}`,
    `Input: ${truncatedInput}`,
    '',
    'Respond with JSON: {"allow": true/false, "reason": "..."}',
  ].join('\n');

  try {
    const model = getSmallFastModel();
    const result = await sideQuery({
      model,
      system: GUARDIAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 256,
      signal,
      thinking: false,
      querySource: 'sdk',
    });

    return parseVerdict(result);
  } catch {
    return { allow: false, reason: 'Guardian evaluator error — denying for safety' };
  }
}

function parseVerdict(result: unknown): GuardianVerdict {
  try {
    const raw = result as { content?: Array<{ type: string; text?: string }> };
    const text = raw.content
      ?.filter((b): b is { type: string; text: string } => b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text)
      .join('\n') ?? '';

    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*"allow"[\s\S]*\}/);
    if (!match) {
      return { allow: false, reason: 'Guardian: could not parse verdict' };
    }
    const parsed = JSON.parse(match[0]) as { allow?: boolean; reason?: string };
    return {
      allow: parsed.allow === true,
      reason: parsed.reason || 'No reason provided',
    };
  } catch {
    return { allow: false, reason: 'Guardian: invalid verdict response' };
  }
}
