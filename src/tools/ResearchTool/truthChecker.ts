export interface SourceCredibility {
  domain: string;
  score: number; // 0-100
  type: 'official' | 'academic' | 'news' | 'community' | 'blog' | 'unknown';
  indicators: string[];
}

export interface ConflictDetection {
  topic: string;
  claims: Array<{
    claim: string;
    sources: string[]; // URLs
    supportCount: number;
  }>;
  resolution?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface TruthCheckResult {
  query: string;
  conflicts: ConflictDetection[];
  credibilityScores: SourceCredibility[];
  summary: string;
  recommendations: string[];
}

// Official domains that are highly credible
const OFFICIAL_DOMAINS = [
  'github.com',
  'docs.github.com',
  'developer.mozilla.org',
  'nodejs.org',
  'python.org',
  'rust-lang.org',
  'go.dev',
  'docs.oracle.com',
  'docs.microsoft.com',
  'aws.amazon.com',
  'cloud.google.com',
  'azure.microsoft.com',
  'docs.aws.amazon.com',
  'wikipedia.org',
  'arxiv.org',
  'ieee.org',
  'acm.org',
  'nature.com',
  'science.org',
  'stackoverflow.com',
  'stackexchange.com',
  'npmjs.com',
  'pypi.org',
];

// Academic and research domains
const ACADEMIC_DOMAINS = [
  'arxiv.org',
  'scholar.google.com',
  'ieee.org',
  'acm.org',
  'springer.com',
  'sciencedirect.com',
  'researchgate.net',
  'semanticscholar.org',
  'jstor.org',
];

// News domains (moderate credibility, fact-checking needed)
const NEWS_DOMAINS = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'cnn.com',
  'nytimes.com',
  'theguardian.com',
  'washingtonpost.com',
  'wsj.com',
  'economist.com',
];

// Community-driven platforms
const COMMUNITY_DOMAINS = [
  'stackoverflow.com',
  'reddit.com',
  'quora.com',
  'medium.com',
  'dev.to',
  'hashnode.com',
  'blogspot.com',
  'wordpress.com',
];

/**
 * Calculate credibility score for a source URL
 */
export function assessSourceCredibility(url: string): SourceCredibility {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');

    let score = 50; // Base score
    let type: SourceCredibility['type'] = 'unknown';
    const indicators: string[] = [];

    // Check official documentation and authoritative sources
    if (OFFICIAL_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) {
      score = 95;
      type = 'official';
      indicators.push('Official documentation or authoritative source');
    }
    // Check academic sources
    else if (ACADEMIC_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) {
      score = 90;
      type = 'academic';
      indicators.push('Academic or research publication');
    }
    // Check news sources
    else if (NEWS_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) {
      score = 75;
      type = 'news';
      indicators.push('Established news organization');
    }
    // Check community sources
    else if (COMMUNITY_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) {
      score = 65;
      type = 'community';
      indicators.push('Community-driven platform');
    }
    // Check for blog patterns
    else if (domain.includes('blog') || domain.includes('medium') || domain.includes('wordpress')) {
      score = 40;
      type = 'blog';
      indicators.push('Personal blog or opinion piece');
    }
    // GitHub repositories
    else if (domain === 'github.com') {
      score = 85;
      type = 'official';
      indicators.push('GitHub repository - check stars and maintenance');
    }
    // StackOverflow
    else if (domain === 'stackoverflow.com') {
      score = 80;
      type = 'community';
      indicators.push('StackOverflow - community-voted answers');
    }

    // Adjust score based on URL patterns
    if (url.includes('/docs/') || url.includes('/documentation/')) {
      score = Math.min(98, score + 10);
      indicators.push('Documentation page');
    }

    if (url.includes('/api/') || url.includes('/reference/')) {
      score = Math.min(95, score + 5);
      indicators.push('API or reference documentation');
    }

    // Penalize certain patterns
    if (url.includes('blog') && !OFFICIAL_DOMAINS.some(d => domain.includes(d))) {
      score = Math.max(20, score - 15);
      indicators.push('Blog content - lower reliability');
    }

    return {
      domain,
      score: Math.max(0, Math.min(100, score)),
      type,
      indicators,
    };
  } catch {
    return {
      domain: 'unknown',
      score: 10,
      type: 'unknown',
      indicators: ['Invalid URL'],
    };
  }
}

/**
 * Detect conflicting claims in source content
 */
export function detectConflicts(
  sources: Array<{ url: string; title: string; content: string }>,
  query: string,
): ConflictDetection[] {
  const conflicts: ConflictDetection[] = [];

  // Extract key statements from each source
  const statements = sources.map(source => {
    const sentences = source.content
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20);

    return {
      url: source.url,
      title: source.title,
      sentences: sentences.slice(0, 10), // Limit to first 10 sentences
    };
  });

  // Simple conflict detection: look for contradictory keywords
  const contradictionPairs = [
    ['can', 'cannot', "can't"],
    ['is', 'is not', "isn't"],
    ['supports', 'does not support', "doesn't support"],
    ['works', 'does not work', "doesn't work"],
    ['possible', 'impossible'],
    ['true', 'false'],
    ['yes', 'no'],
    ['enabled', 'disabled'],
    ['allowed', 'not allowed'],
    ['recommended', 'not recommended'],
  ];

  // Group sentences by topic (simple keyword matching)
  const topicMap = new Map<string, Array<{ sentence: string; url: string }>>();

  for (const stmt of statements) {
    for (const sentence of stmt.sentences) {
      const lowerSentence = sentence.toLowerCase();

      // Skip if sentence doesn't seem relevant to query
      const queryWords = query
        .toLowerCase()
        .split(' ')
        .filter(w => w.length > 3);
      const hasRelevantWord = queryWords.some(w => lowerSentence.includes(w));
      if (!hasRelevantWord) continue;

      // Extract a simple topic (words that appear in both query and sentence)
      const queryWordsSet = new Set(queryWords);
      const sentenceWords = lowerSentence.split(/\s+/).filter(w => w.length > 3);
      const topicWords = sentenceWords.filter(w => queryWordsSet.has(w)).sort();

      if (topicWords.length < 1) {
        // Fallback: just use first 2 significant words if no query words match
        const significant = sentenceWords
          .filter(w => w.length > 5)
          .slice(0, 2)
          .sort();
        if (significant.length < 2) continue;
        topicWords.push(...significant);
      }

      const words = [...new Set(topicWords)].join(' ');
      if (words.length < 3) continue;

      if (!topicMap.has(words)) {
        topicMap.set(words, []);
      }
      topicMap.get(words)!.push({ sentence, url: stmt.url });
    }
  }

  // Analyze each topic for conflicts
  for (const [topic, statements] of topicMap.entries()) {
    if (statements.length < 2) continue;

    // Check for contradictory statements
    const claims: ConflictDetection['claims'] = [];
    const seenSentences = new Set<string>();

    for (const stmt of statements) {
      const normalized = stmt.sentence.toLowerCase().replace(/[^\w\s]/g, '');

      if (seenSentences.has(normalized)) continue;
      seenSentences.add(normalized);

      // Check if this statement contradicts any existing claim
      let foundConflict = false;

      for (const claim of claims) {
        if (isContradictory(claim.claim, stmt.sentence, contradictionPairs)) {
          // If contradictory, it's a separate claim group
          continue;
        }

        // If it's NOT contradictory, maybe it's the same claim but worded differently?
        if (isSimilar(claim.claim, stmt.sentence)) {
          claim.sources.push(stmt.url);
          claim.supportCount++;
          foundConflict = true;
          break;
        }
      }

      if (!foundConflict) {
        claims.push({
          claim: stmt.sentence,
          sources: [stmt.url],
          supportCount: 1,
        });
      }
    }

    // Only report if there are multiple conflicting claims (different claim groups for same topic)
    if (claims.length >= 2) {
      // Check if at least one pair is actually contradictory
      let hasRealContradiction = false;
      for (let i = 0; i < claims.length; i++) {
        for (let j = i + 1; j < claims.length; j++) {
          if (isContradictory(claims[i].claim, claims[j].claim, contradictionPairs)) {
            hasRealContradiction = true;
            break;
          }
        }
        if (hasRealContradiction) break;
      }

      if (hasRealContradiction) {
        const sortedClaims = claims.sort((a, b) => b.supportCount - a.supportCount);

        conflicts.push({
          topic: topic.substring(0, 100),
          claims: sortedClaims,
          confidence: sortedClaims.length > 2 ? 'high' : 'medium',
        });
      }
    }
  }

  return conflicts;
}

/**
 * Check if two statements are similar (simple word overlap)
 */
function isSimilar(s1: string, s2: string): boolean {
  const w1 = new Set(
    s1
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4),
  );
  const w2 = new Set(
    s2
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4),
  );

  if (w1.size === 0 || w2.size === 0) return false;

  const intersection = new Set([...w1].filter(w => w2.has(w)));
  const overlap = intersection.size / Math.max(w1.size, w2.size);

  return overlap > 0.6; // 60% similarity threshold
}

/**
 * Check if two statements are contradictory
 */
function isContradictory(statement1: string, statement2: string, contradictionPairs: string[][]): boolean {
  const lower1 = statement1.toLowerCase();
  const lower2 = statement2.toLowerCase();

  for (const pair of contradictionPairs) {
    const hasFirst = pair.some(p => lower1.includes(p));
    const hasSecond = pair.some(p => lower2.includes(p));

    if (hasFirst && hasSecond) {
      // Check if they're talking about the same subject
      const words1 = new Set(lower1.split(' ').filter(w => w.length > 4));
      const words2 = new Set(lower2.split(' ').filter(w => w.length > 4));

      const intersection = new Set([...words1].filter(w => words2.has(w)));
      if (intersection.size >= 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Generate a truth-check summary with conflict resolution
 */
export function generateTruthCheckSummary(
  conflicts: ConflictDetection[],
  credibilityScores: SourceCredibility[],
  query: string,
): TruthCheckResult {
  const credibilityMap = new Map(credibilityScores.map(c => [c.domain, c]));

  // Resolve each conflict
  const resolvedConflicts = conflicts.map(conflict => {
    // Sort claims by credibility of their sources
    const claimsWithCredibility = conflict.claims
      .map(claim => {
        const avgCredibility =
          claim.sources.reduce((sum, url) => {
            try {
              const domain = new URL(url).hostname.replace('www.', '');
              const cred = credibilityMap.get(domain);
              return sum + (cred?.score || 50);
            } catch {
              return sum + 50;
            }
          }, 0) / claim.sources.length;

        return { ...claim, avgCredibility };
      })
      .sort((a, b) => b.avgCredibility - a.avgCredibility);

    const topClaim = claimsWithCredibility[0];
    const topSources = topClaim.sources.map(url => {
      try {
        const domain = new URL(url).hostname.replace('www.', '');
        const cred = credibilityMap.get(domain);
        return `${url} (credibility: ${cred?.score || 'N/A'})`;
      } catch {
        return url;
      }
    });

    conflict.resolution = `Most credible claim: "${topClaim.claim.substring(0, 150)}..." supported by ${topClaim.sources.length} source(s) with average credibility score of ${topClaim.avgCredibility.toFixed(1)}. Sources: ${topSources.slice(0, 2).join(', ')}`;
    conflict.confidence = topClaim.avgCredibility > 80 ? 'high' : topClaim.avgCredibility > 60 ? 'medium' : 'low';

    return conflict;
  });

  // Generate overall summary
  let summary = `Truth-check analysis for query: "${query}"\n\n`;

  if (resolvedConflicts.length === 0) {
    summary +=
      'No significant conflicts detected between sources. The information appears consistent across sources.\n';
  } else {
    summary += `Detected ${resolvedConflicts.length} potential conflict(s) between sources:\n\n`;

    resolvedConflicts.forEach((conflict, i) => {
      summary += `${i + 1}. Topic: ${conflict.topic}\n`;
      summary += `   Resolution: ${conflict.resolution}\n`;
      summary += `   Confidence: ${conflict.confidence}\n\n`;
    });
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (resolvedConflicts.length > 0) {
    recommendations.push('Cross-reference conflicting claims with official documentation when possible.');
    recommendations.push('Pay attention to the credibility scores of sources when evaluating conflicting information.');

    const lowCredibilityConflicts = resolvedConflicts.filter(c => c.confidence === 'low');
    if (lowCredibilityConflicts.length > 0) {
      recommendations.push('Some conflicts have low confidence resolution - consider additional research.');
    }
  }

  const lowCredibilitySources = credibilityScores.filter(c => c.score < 50);
  if (lowCredibilitySources.length > 0) {
    recommendations.push(`Be cautious with information from: ${lowCredibilitySources.map(s => s.domain).join(', ')}`);
  }

  return {
    query,
    conflicts: resolvedConflicts,
    credibilityScores,
    summary,
    recommendations,
  };
}
