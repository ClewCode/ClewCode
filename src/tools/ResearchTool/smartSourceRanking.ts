import { logError } from '../../utils/log.js';

export interface SourceScore {
  url: string;
  domain: string;
  score: number; // 0-100
  tier: 'premium' | 'high' | 'medium' | 'low' | 'spam';
  reasons: string[];
  metadata?: {
    hasCodeBlocks?: boolean;
    contentLength?: number;
    hasOfficialKeywords?: boolean;
    isAdOrSEO?: boolean;
  };
}

export interface RankingOptions {
  preferOfficial?: boolean;
  excludeSpam?: boolean;
  minScore?: number;
  maxResults?: number;
}

// Premium sources - highest credibility
const PREMIUM_DOMAINS = [
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
  'docs.aws.amazon.com',
  'cloud.google.com',
  'docs.oracle.com',
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
  'rubygems.org',
  'crates.io',
  'maven.org',
];

// High-quality technical documentation
const OFFICIAL_DOC_DOMAINS = ['docs.', 'documentation.', 'wiki.', 'guide.', 'reference.', 'api.', 'developers.'];

// Known SEO/spam patterns
const SEO_SPAM_PATTERNS = [
  'best-\\w+-tips',
  'top-\\d+-\\w+',
  'how-to-\\w+-\\d+',
  '\\d+-ways-to',
  'ultimate-guide',
  'complete-guide',
  'review-\\d+',
  'vs-\\w+-\\d+',
  'comparison-\\d+',
  'buy-\\w+',
  'cheap-\\w+',
  'discount',
  'coupon',
  'free-trial',
];

// Ad/affiliate patterns
const AD_PATTERNS = [
  'affiliate',
  'sponsored',
  'advertisement',
  'promo',
  'deal',
  'offer',
  'limited-time',
  'click-here',
  'buy-now',
];

// Official keyword indicators
const OFFICIAL_KEYWORDS = [
  'documentation',
  'official',
  'api reference',
  'specification',
  'rfc',
  'standard',
  'guide',
  'tutorial',
  'best practices',
  'architecture',
  'design patterns',
];

/**
 * Calculate smart ranking score for a source
 */
export function calculateSourceScore(url: string, title: string, excerpt: string, content?: string): SourceScore {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');

    let score = 50; // Base score
    const reasons: string[] = [];
    const metadata: SourceScore['metadata'] = {
      hasCodeBlocks: false,
      contentLength: content?.length || excerpt.length,
      hasOfficialKeywords: false,
      isAdOrSEO: false,
    };

    // Check premium domains (highest priority)
    if (PREMIUM_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) {
      score = 95;
      reasons.push('Premium source (GitHub, MDN, official docs, etc.)');
      metadata.hasOfficialKeywords = true;
    }
    // Check official documentation subdomains
    else if (OFFICIAL_DOC_DOMAINS.some(prefix => domain.startsWith(prefix))) {
      score = 90;
      reasons.push('Official documentation domain');
      metadata.hasOfficialKeywords = true;
    }
    // GitHub repositories (special case)
    else if (domain === 'github.com' && urlObj.pathname.split('/').length >= 3) {
      score = 85;
      reasons.push('GitHub repository');

      // Check if it's a well-known project
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        const repoName = pathParts[1].toLowerCase();
        const popularRepos = ['react', 'vue', 'angular', 'node', 'python', 'typescript', 'rust', 'go'];
        if (popularRepos.includes(repoName)) {
          score = 92;
          reasons.push('Popular GitHub repository');
        }
      }
    }
    // StackOverflow
    else if (domain === 'stackoverflow.com') {
      score = 80;
      reasons.push('StackOverflow community Q&A');

      // Check if it's a highly voted question
      if (url.includes('/questions/')) {
        score += 5;
        reasons.push('StackOverflow question page');
      }
    }
    // Wikipedia
    else if (domain === 'wikipedia.org') {
      score = 88;
      reasons.push('Wikipedia encyclopedia entry');
    }
    // Academic sources
    else if (domain.includes('arxiv') || domain.includes('scholar') || domain.includes('research')) {
      score = 87;
      reasons.push('Academic/research source');
    }
    // News sources
    else if (isNewsDomain(domain)) {
      score = 70;
      reasons.push('News organization');
    }
    // Community platforms
    else if (isCommunityDomain(domain)) {
      score = 65;
      reasons.push('Community platform');
    }
    // Blog detection
    else if (isBlogDomain(domain) || domain.includes('blog')) {
      score = 45;
      reasons.push('Blog or personal website');
    }
    // Forum detection
    else if (domain.includes('forum') || domain.includes('discuss')) {
      score = 55;
      reasons.push('Forum discussion');
    }
    // Default unknown source
    else {
      score = 40;
      reasons.push('Unknown or unverified source');
    }

    // Analyze content for quality indicators
    const fullText = `${title} ${excerpt} ${content || ''}`.toLowerCase();

    // Check for official keywords
    const officialKeywordCount = OFFICIAL_KEYWORDS.filter(kw => fullText.includes(kw)).length;
    if (officialKeywordCount > 0) {
      score = Math.min(98, score + officialKeywordCount * 3);
      reasons.push(`Contains ${officialKeywordCount} official keyword(s)`);
      metadata.hasOfficialKeywords = true;
    }

    // Check for code blocks (indicates technical content)
    if (
      content &&
      (content.includes('```') ||
        content.includes('<code') ||
        content.includes('function ') ||
        content.includes('class '))
    ) {
      score = Math.min(98, score + 5);
      reasons.push('Contains code examples');
      metadata.hasCodeBlocks = true;
    }

    // Check for SEO spam patterns in URL
    const urlPath = urlObj.pathname.toLowerCase();
    const isSEO = SEO_SPAM_PATTERNS.some(pattern => new RegExp(pattern).test(urlPath));
    if (isSEO) {
      score = Math.max(5, score - 30);
      reasons.push('⚠️ Detected SEO spam patterns in URL');
      metadata.isAdOrSEO = true;
    }

    // Check for ad patterns
    const hasAds = AD_PATTERNS.some(pattern => fullText.includes(pattern));
    if (hasAds) {
      score = Math.max(5, score - 25);
      reasons.push('⚠️ Contains advertising/sponsored content');
      metadata.isAdOrSEO = true;
    }

    // Penalize very short content
    if ((content?.length || 0) < 100 && excerpt.length < 50) {
      score = Math.max(10, score - 15);
      reasons.push('Very short content');
    }

    // Boost for longer, detailed content
    if ((content?.length || 0) > 5000) {
      score = Math.min(98, score + 5);
      reasons.push('Comprehensive content length');
    }

    // Check title quality
    if (title.length < 10) {
      score = Math.max(10, score - 10);
      reasons.push('Very short title');
    }

    // Detect clickbait titles
    const clickbaitPatterns = ["you won't believe", 'shocking', 'amazing', 'incredible', 'mind-blowing'];
    if (clickbaitPatterns.some(p => title.toLowerCase().includes(p))) {
      score = Math.max(10, score - 20);
      reasons.push('⚠️ Clickbait title detected');
    }

    // Determine tier
    let tier: SourceScore['tier'];
    if (score >= 85) tier = 'premium';
    else if (score >= 70) tier = 'high';
    else if (score >= 50) tier = 'medium';
    else if (score >= 30) tier = 'low';
    else tier = 'spam';

    return {
      url,
      domain,
      score: Math.max(0, Math.min(100, score)),
      tier,
      reasons,
      metadata,
    };
  } catch (error) {
    logError(error as Error);
    return {
      url,
      domain: 'unknown',
      score: 5,
      tier: 'spam',
      reasons: ['Invalid URL or error processing'],
    };
  }
}

/**
 * Check if domain is a news organization
 */
function isNewsDomain(domain: string): boolean {
  const newsDomains = [
    'reuters.com',
    'apnews.com',
    'bbc.com',
    'bbc.co.uk',
    'cnn.com',
    'nytimes.com',
    'theguardian.com',
    'washingtonpost.com',
    'wsj.com',
    'economist.com',
    'npr.org',
    'cbsnews.com',
    'abcnews.go.com',
    'nbcnews.com',
    'foxnews.com',
    'usatoday.com',
  ];
  return newsDomains.some(d => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Check if domain is a community platform
 */
function isCommunityDomain(domain: string): boolean {
  const communityDomains = [
    'reddit.com',
    'quora.com',
    'medium.com',
    'dev.to',
    'hashnode.com',
    'linkedin.com',
    'facebook.com',
    'twitter.com',
    'x.com',
  ];
  return communityDomains.some(d => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Check if domain is a blog platform
 */
function isBlogDomain(domain: string): boolean {
  const blogDomains = ['blogspot.com', 'wordpress.com', 'ghost.io', 'substack.com', 'tumblr.com', 'typepad.com'];
  return blogDomains.some(d => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Rank and filter sources based on smart scoring
 */
export function rankSources(
  sources: Array<{
    url: string;
    title: string;
    excerpt: string;
    content?: string;
    type?: string;
  }>,
  options: RankingOptions = {},
): Array<{
  url: string;
  title: string;
  excerpt: string;
  type?: string;
  score: SourceScore;
}> {
  const { preferOfficial = true, excludeSpam = true, minScore = 0, maxResults } = options;

  // Calculate scores for all sources
  const scoredSources = sources.map(source => ({
    ...source,
    score: calculateSourceScore(source.url, source.title, source.excerpt, source.content),
  }));

  // Filter based on options
  let filtered = scoredSources;

  if (excludeSpam) {
    filtered = filtered.filter(s => s.score.tier !== 'spam');
  }

  if (minScore > 0) {
    filtered = filtered.filter(s => s.score.score >= minScore);
  }

  // Sort by score (highest first)
  filtered.sort((a, b) => b.score.score - a.score.score);

  // If preferOfficial, boost official sources to top
  if (preferOfficial) {
    filtered.sort((a, b) => {
      const aIsOfficial = a.score.tier === 'premium' || a.score.tier === 'high' ? 1 : 0;
      const bIsOfficial = b.score.tier === 'premium' || b.score.tier === 'high' ? 1 : 0;
      return bIsOfficial - aIsOfficial;
    });
  }

  // Limit results
  if (maxResults && maxResults > 0) {
    filtered = filtered.slice(0, maxResults);
  }

  return filtered;
}

/**
 * Generate a ranking report for debugging/transparency
 */
export function generateRankingReport(scores: SourceScore[]): string {
  let report = '# Source Ranking Report\n\n';

  // Summary by tier
  const tierCounts = {
    premium: 0,
    high: 0,
    medium: 0,
    low: 0,
    spam: 0,
  };

  scores.forEach(s => {
    tierCounts[s.tier]++;
  });

  report += '## Summary\n\n';
  report += `| Tier | Count |\n`;
  report += `|------|-------|\n`;
  report += `| Premium | ${tierCounts.premium} |\n`;
  report += `| High | ${tierCounts.high} |\n`;
  report += `| Medium | ${tierCounts.medium} |\n`;
  report += `| Low | ${tierCounts.low} |\n`;
  report += `| Spam | ${tierCounts.spam} |\n\n`;

  // Detailed scores
  report += '## Detailed Scores (sorted by score)\n\n';
  report += `| Rank | Domain | Score | Tier | Reasons |\n`;
  report += `|------|--------|-------|------|--------|\n`;

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  sorted.forEach((s, i) => {
    const reasons = s.reasons.join('; ');
    report += `| ${i + 1} | ${s.domain} | ${s.score} | ${s.tier} | ${reasons} |\n`;
  });

  return report;
}
