import type { ResearchClaim, ResearchSource, SynthesizerResult } from './types.js';

/**
 * Synthesize claims across multiple sources.
 * Groups claims by topic, detects agreement/conflict, identifies gaps, and
 * produces a confidence-scored summary.
 */
export async function synthesizeClaims(
  claims: ResearchClaim[],
  sources: ResearchSource[],
  query: string,
  ask?: (prompt: string) => Promise<string>,
): Promise<SynthesizerResult> {
  if (claims.length === 0) {
    return {
      summary: 'No claims to synthesize.',
      consensusFindings: [],
      conflicts: [],
      gaps: [],
      overallConfidence: 'low',
    };
  }

  // Group claims by topic using simple keyword overlap
  const topics = groupClaimsByTopic(claims);

  // Build source map for reference
  const sourceMap = new Map<string, ResearchSource>();
  for (const s of sources) sourceMap.set(s.id, s);

  // Detect consensus and conflicts
  const consensusFindings: SynthesizerResult['consensusFindings'] = [];
  const conflicts: SynthesizerResult['conflicts'] = [];

  for (const [topic, topicClaims] of topics) {
    const uniqueSources = new Set(topicClaims.flatMap(c => c.sourceIds));

    if (uniqueSources.size >= 2) {
      // Multiple sources — check for agreement/conflict
      const texts = topicClaims.map(c => c.claim);
      const allSimilar = texts.every((t, i) => i === 0 || isSemanticallySimilar(texts[0]!, t));

      if (allSimilar) {
        consensusFindings.push({
          topic,
          claims: texts,
          sourceCount: uniqueSources.size,
        });
      } else {
        for (let i = 1; i < texts.length; i++) {
          conflicts.push({
            topic,
            claimA: texts[0]!,
            claimB: texts[i]!,
            sources: topicClaims.slice(0, 2).flatMap(c => c.sourceIds),
          });
        }
      }
    } else if (uniqueSources.size === 1) {
      // Single source — note as potential gap
      consensusFindings.push({
        topic,
        claims: topicClaims.map(c => c.claim),
        sourceCount: 1,
      });
    }
  }

  // Use LLM for narrative synthesis if available
  let summary = '';
  let gaps: string[] = [];
  let overallConfidence: SynthesizerResult['overallConfidence'] = 'medium';

  if (ask) {
    try {
      const prompt = buildSynthesisPrompt(query, claims, sources, consensusFindings, conflicts);
      const response = await ask(prompt);
      const json = response.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(json) as {
        summary?: string;
        gaps?: string[];
        overallConfidence?: string;
      };

      summary = parsed.summary || buildFallbackSummary(consensusFindings, conflicts);
      gaps = parsed.gaps || [];
      overallConfidence = (['high', 'medium', 'low'].includes(parsed.overallConfidence || '')
        ? (parsed.overallConfidence as SynthesizerResult['overallConfidence'])
        : computeOverallConfidence(claims));
    } catch {
      summary = buildFallbackSummary(consensusFindings, conflicts);
      overallConfidence = computeOverallConfidence(claims);
    }
  } else {
    summary = buildFallbackSummary(consensusFindings, conflicts);
    overallConfidence = computeOverallConfidence(claims);
  }

  return { summary, consensusFindings, conflicts, gaps, overallConfidence };
}

function groupClaimsByTopic(claims: ResearchClaim[]): Map<string, ResearchClaim[]> {
  const topics = new Map<string, ResearchClaim[]>();

  for (const claim of claims) {
    // Simple keyword-based grouping: extract significant words
    const words = claim.claim
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 3);
    const topic = words.join(' ') || claim.type;
    const existing = topics.get(topic);
    if (existing) {
      existing.push(claim);
    } else {
      topics.set(topic, [claim]);
    }
  }

  return topics;
}

function isSemanticallySimilar(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union > 0.3;
}

function buildSynthesisPrompt(
  query: string,
  claims: ResearchClaim[],
  sources: ResearchSource[],
  consensus: SynthesizerResult['consensusFindings'],
  conflicts: SynthesizerResult['conflicts'],
): string {
  const claimsText = claims.map(c => `- [${c.confidence}] ${c.claim} (source: ${c.sourceIds.join(',')})`).join('\n');
  const consensusText = consensus.map(c => `- Consensus: "${c.topic}" (${c.sourceCount} sources)`).join('\n');
  const conflictText = conflicts.map(c => `- Conflict: "${c.topic}" — A: "${c.claimA.slice(0, 80)}" vs B: "${c.claimB.slice(0, 80)}"`).join('\n');

  return [
    `Synthesize the following research claims for the query: "${query}"`,
    ``,
    `## Claims (${claims.length} total from ${sources.length} sources):`,
    claimsText,
    ``,
    `## Detected Consensus:`,
    consensusText || '(none)',
    ``,
    `## Detected Conflicts:`,
    conflictText || '(none)',
    ``,
    `Return JSON with:`,
    `- summary: string (2-4 sentence synthesis of what we know)`,
    `- gaps: string[] (what's still unknown or needs more research)`,
    `- overallConfidence: "high" | "medium" | "low"`,
    ``,
    `Respond ONLY with valid JSON. No markdown, no explanation.`,
  ].join('\n');
}

function buildFallbackSummary(
  consensus: SynthesizerResult['consensusFindings'],
  conflicts: SynthesizerResult['conflicts'],
): string {
  const parts: string[] = [];
  if (consensus.length > 0) {
    parts.push(`${consensus.length} topic(s) with corroborating sources.`);
  }
  if (conflicts.length > 0) {
    parts.push(`${conflicts.length} potential conflict(s) detected across sources.`);
  }
  return parts.length > 0 ? parts.join(' ') : 'Synthesis completed. Review findings for details.';
}

function computeOverallConfidence(claims: ResearchClaim[]): SynthesizerResult['overallConfidence'] {
  const highCount = claims.filter(c => c.confidence === 'high').length;
  const mediumCount = claims.filter(c => c.confidence === 'medium').length;
  const lowCount = claims.filter(c => c.confidence === 'low').length;

  if (highCount > mediumCount + lowCount) return 'high';
  if (lowCount > highCount + mediumCount) return 'low';
  return 'medium';
}
