import type { Citation, ResearchClaim, ResearchSource } from './types.js';

export function buildCitations(sources: ResearchSource[], claims: ResearchClaim[]): Citation[] {
  const citations: Citation[] = [];
  let citeCounter = 1;

  for (const source of sources) {
    // Find all claims that use this source
    const usedClaims = claims.filter(claim => claim.sourceIds.includes(source.id)).map(claim => claim.id);

    if (usedClaims.length > 0) {
      citations.push({
        id: `cite:${citeCounter.toString().padStart(3, '0')}`,
        sourceId: source.id,
        title: source.title,
        url: source.url,
        path: source.path,
        usedForClaims: usedClaims,
      });
      citeCounter++;
    }
  }

  return citations;
}

export function formatBibliography(citations: Citation[]): string {
  if (citations.length === 0) {
    return 'No citations available.';
  }

  return citations
    .map((cite, index) => {
      const ref = cite.url ? `[Link](${cite.url})` : cite.path ? `\`${cite.path}\`` : '';
      return `${index + 1}. **[${cite.id}]** ${cite.title} ${ref ? `— ${ref}` : ''}`;
    })
    .join('\n');
}
