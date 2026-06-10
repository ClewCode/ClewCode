import type { ClaimStatus, ResearchClaim } from './types.js';

export function createClaim(
  id: string,
  claimText: string,
  type: 'fact' | 'design_principle' | 'recommendation' | 'risk' | 'decision',
  status: ClaimStatus,
  confidence: 'high' | 'medium' | 'low',
  sourceIds: string[],
  notes?: string,
): ResearchClaim {
  return { id, claim: claimText, type, status, confidence, sourceIds, notes };
}

/**
 * Keyword-based extraction — fast, no LLM required.
 * Extracts bullet-point claims from markdown text.
 * Used as fallback when LLM is unavailable.
 */
export function extractClaimsFromText(text: string, sourceId: string): ResearchClaim[] {
  const claims: ResearchClaim[] = [];
  const lines = text.split('\n');
  let claimCounter = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
      const claimText = trimmed.replace(/^[-*\s]+/, '');
      if (claimText.length > 20 && !claimText.startsWith('http')) {
        claims.push(
          createClaim(
            `claim:${sourceId.split(':').pop()}:${claimCounter.toString().padStart(3, '0')}`,
            claimText,
            'fact',
            'supported',
            'medium',
            [sourceId],
            'Extracted from document bullet points',
          ),
        );
        claimCounter++;
      }
    }
  }

  return claims;
}

/**
 * LLM-driven claim extraction — sends source text to the model and parses
 * structured claims with type, confidence, and source linking.
 */
export async function extractClaimsLLM(
  text: string,
  sourceId: string,
  query: string,
  ask: (prompt: string) => Promise<string>,
): Promise<ResearchClaim[]> {
  // Truncate text to avoid blowing context
  const truncated = text.slice(0, 6000);

  const prompt = [
    `Extract factual claims from the following document. The research query is: "${query}"`,
    ``,
    `Document text:`,
    `"""`,
    truncated,
    `"""`,
    ``,
    `Return a JSON array of claims. Each claim must have:`,
    `- claim: string (the claim itself, in your own words, one sentence)`,
    `- type: "fact" | "design_principle" | "recommendation" | "risk" | "decision"`,
    `- confidence: "high" | "medium" | "low"`,
    ``,
    `Confidence guidelines:`,
    `- high: explicitly stated with clear evidence in the text`,
    `- medium: reasonably inferred from the text`,
    `- low: weakly supported or speculative`,
    ``,
    `Return 2-8 claims maximum. Skip trivial or obvious statements.`,
    `Respond ONLY with valid JSON array. No markdown, no explanation.`,
  ].join('\n');

  try {
    const response = await ask(prompt);
    const json = response
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    const parsed = JSON.parse(json) as Array<{
      claim?: string;
      type?: string;
      confidence?: string;
    }>;

    if (!Array.isArray(parsed)) return [];

    return parsed
      .slice(0, 8)
      .map((c, i) =>
        createClaim(
          `claim:${sourceId.split(':').pop()}:${(i + 1).toString().padStart(3, '0')}`,
          c.claim || 'Untitled claim',
          (['fact', 'design_principle', 'recommendation', 'risk', 'decision'].includes(c.type || '')
            ? c.type
            : 'fact') as ResearchClaim['type'],
          (c.confidence === 'high' || c.confidence === 'low' ? c.confidence : 'medium') === 'high'
            ? 'supported'
            : c.confidence === 'low'
              ? 'partially_supported'
              : 'supported',
          (['high', 'medium', 'low'].includes(c.confidence || '')
            ? c.confidence
            : 'medium') as ResearchClaim['confidence'],
          [sourceId],
          `LLM-extracted from source document`,
        ),
      );
  } catch {
    return [];
  }
}
