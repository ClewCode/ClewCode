/**
 * Proactive Memory Injection & Hierarchical Context Retrieval
 *
 * Automatically surfaces relevant architectural decisions, caveats, and learned patterns
 * based on active workspace files and prompt context without requiring explicit user invocation.
 */

import { getPreviousSessionContext } from '../longTermMemory/crossSession.js';

export interface MemoryFact {
  id: string;
  category: 'architecture' | 'caveat' | 'pattern' | 'fix';
  summary: string;
  relevanceScore: number;
  files?: string[];
  source?: string;
  updatedAt?: number;
}

export interface ProactiveMemoryOptions {
  activeFiles?: string[];
  queryContext?: string;
  maxFacts?: number;
  minRelevance?: number;
}

/**
 * Extract keywords and file basenames from context strings.
 */
export function extractContextTerms(activeFiles?: string[], queryContext?: string): string[] {
  const terms = new Set<string>();

  if (activeFiles) {
    for (const f of activeFiles) {
      const normalized = f.replace(/\\/g, '/');
      const basename = normalized
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '');
      if (basename && basename.length > 2) {
        terms.add(basename.toLowerCase());
      }
    }
  }

  if (queryContext) {
    const words = queryContext
      .toLowerCase()
      .replace(/[^a-z0-9_\-\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
    for (const w of words) {
      terms.add(w);
    }
  }

  return Array.from(terms);
}

/**
 * Filter out stale or conflicting memory facts when newer rules or constraints override them.
 */
export function filterConflictingFacts(facts: MemoryFact[], activeRules?: string[]): MemoryFact[] {
  if (!activeRules || activeRules.length === 0) return facts;

  const ruleTexts = activeRules.map(r => r.toLowerCase());

  return facts.filter(fact => {
    const factText = fact.summary.toLowerCase();
    for (const rule of ruleTexts) {
      const isProhibitive =
        rule.includes('never') || rule.includes('do not') || rule.includes('avoid') || rule.includes('prohibit');
      if (isProhibitive) {
        const segments = rule.split(/[,;.]/);
        for (const seg of segments) {
          if (seg.includes('never') || seg.includes('do not') || seg.includes('avoid') || seg.includes('prohibit')) {
            const stripped = seg.replace(/never|do not|avoid|prohibit\w*/g, '').trim();
            if (stripped.length > 3 && (factText.includes(stripped) || stripped.includes(factText))) {
              return false;
            }
          }
        }
      }
    }
    return true;
  });
}

/**
 * Compute the proactive memory injection context to feed into dynamic system prompt.
 */
export async function getProactiveMemoryContext(options: ProactiveMemoryOptions = {}): Promise<string | null> {
  const { activeFiles = [], queryContext = '', maxFacts = 5 } = options;
  const projectRoot = process.cwd();

  const terms = extractContextTerms(activeFiles, queryContext);
  if (terms.length === 0 && activeFiles.length === 0) {
    // If no specific terms, retrieve previous session summary if recent
    const prev = getPreviousSessionContext(projectRoot);
    if (prev) {
      return prev;
    }
    return null;
  }

  const facts: MemoryFact[] = [];

  // Check previous session context for related terms
  const prevSession = getPreviousSessionContext(projectRoot);
  if (prevSession) {
    for (const line of prevSession.split('\n')) {
      const lower = line.toLowerCase();
      const matchCount = terms.filter(t => lower.includes(t)).length;
      if (matchCount > 0) {
        facts.push({
          id: `prev_session_${facts.length}`,
          category: lower.includes('fix') || lower.includes('bug') ? 'fix' : 'architecture',
          summary: line.trim(),
          relevanceScore: matchCount * 1.5,
          source: 'previous_session',
        });
      }
    }
  }

  if (facts.length === 0) {
    return null;
  }

  // Sort by relevance score
  facts.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const selected = facts.slice(0, maxFacts);

  const formattedLines = selected.map(f => `- [${f.category.toUpperCase()}] ${f.summary}`);

  return `### Relevant Project Knowledge & Caveats\n${formattedLines.join('\n')}`;
}
