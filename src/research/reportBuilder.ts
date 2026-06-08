import { formatBibliography } from './citations.js';
import type { Citation, ResearchClaim, ResearchPlan, SynthesizerResult } from './types.js';

export function buildResearchReport(
  query: string,
  plan: ResearchPlan,
  claims: ResearchClaim[],
  citations: Citation[],
  synthesis?: SynthesizerResult,
): string {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const findingsText =
    claims.length === 0
      ? 'No specific findings extracted.'
      : claims
          .map((claim, index) => {
            const sourceCites = citations
              .filter(cite => cite.usedForClaims.includes(claim.id))
              .map(cite => `[${cite.id}]`)
              .join(', ');

            return [
              `### Finding ${index + 1}`,
              '',
              `**Claim:** ${claim.claim} ${sourceCites ? `(${sourceCites})` : ''}`,
              `**Type:** ${claim.type}  `,
              `**Confidence:** ${claim.confidence}  `,
              '',
            ].join('\n');
          })
          .join('\n');

  const synthesisSection = synthesis
    ? [
        '## Synthesis',
        '',
        `**Overall Confidence:** ${synthesis.overallConfidence}`,
        '',
        synthesis.summary,
        '',
        synthesis.consensusFindings.length > 0
          ? [
              '### Consensus Findings',
              '',
              ...synthesis.consensusFindings.map(
                c => `- **${c.topic}** (${c.sourceCount} sources): ${c.claims.slice(0, 2).join('; ')}`,
              ),
              '',
            ].join('\n')
          : '',
        synthesis.conflicts.length > 0
          ? [
              '### Conflicts to Resolve',
              '',
              ...synthesis.conflicts.map(
                c => `- **${c.topic}** — A: "${c.claimA.slice(0, 80)}" vs B: "${c.claimB.slice(0, 80)}"`,
              ),
              '',
            ].join('\n')
          : '',
        synthesis.gaps.length > 0
          ? ['### Research Gaps', '', ...synthesis.gaps.map(g => `- ${g}`), ''].join('\n')
          : '',
      ].join('\n')
    : '';

  const report = [
    `# Research Report — ${query}`,
    '',
    `**Date:** ${date}  `,
    `**Mode:** ${plan.mode}  `,
    `**Sources:** ${citations.length}  `,
    `**Claims:** ${claims.length}  `,
    '',
    '## Question',
    '',
    query,
    '',
    '## Sub-Questions',
    '',
    plan.subQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
    '',
    '## Key Findings',
    '',
    findingsText,
    synthesisSection,
    '## Risks',
    '',
    plan.risks.map(r => `- ${r}`).join('\n'),
    '',
    '## Sources',
    '',
    formatBibliography(citations),
    '',
  ].join('\n');

  return report;
}
