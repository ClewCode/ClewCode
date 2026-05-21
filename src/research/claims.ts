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
  return {
    id,
    claim: claimText,
    type,
    status,
    confidence,
    sourceIds,
    notes,
  };
}

export function extractClaimsFromText(text: string, sourceId: string): ResearchClaim[] {
  const claims: ResearchClaim[] = [];
  const lines = text.split('\n');

  let claimCounter = 1;
  for (const line of lines) {
    const trimmed = line.trim();
    // Look for bullet points with solid claims
    if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
      const claimText = trimmed.replace(/^[-*\s]+/, '');
      if (claimText.length > 20 && !claimText.startsWith('http')) {
        claims.push(
          createClaim(
            `claim:${sourceId.split(':').pop()}:${claimCounter.toString().padStart(3, '0')}`,
            claimText,
            'fact',
            'supported',
            'high',
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
