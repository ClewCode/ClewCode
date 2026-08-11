/**
 * Search query language for the session catalog.
 *
 * Three modes, in one line of input:
 *   foo bar        — every token must match (substring, else fuzzy subsequence)
 *   "node cve"     — quoted tokens must match as a literal phrase
 *   re:^fix        — the rest of the line is a case-insensitive regular expression
 *
 * Scores are "lower is better" so callers can rank matches; an unparseable
 * query matches nothing rather than everything.
 */

export type ParsedSearchQuery = {
  mode: 'tokens' | 'regex';
  tokens: { kind: 'fuzzy' | 'phrase'; value: string }[];
  regex: RegExp | null;
  /** Set when parsing failed; the query then matches nothing. */
  error?: string;
};

export type SearchMatchResult = {
  matches: boolean;
  /** Lower is better. Only meaningful when matches === true. */
  score: number;
};

function normalizeWhitespaceLower(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Join arbitrary session fields into the common search corpus. */
export function createSessionSearchText(parts: readonly (string | undefined | null)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ');
}

/**
 * Subsequence match with a gap penalty. Returns a score where 0 is a perfect
 * prefix match and larger numbers mean the letters were further apart.
 */
export function fuzzyMatch(needle: string, haystack: string): SearchMatchResult {
  const pattern = normalizeWhitespaceLower(needle);
  const text = normalizeWhitespaceLower(haystack);
  if (!pattern) return { matches: true, score: 0 };
  if (!text) return { matches: false, score: 0 };

  let score = 0;
  let cursor = 0;
  let previousIndex = -1;
  for (const char of pattern) {
    const index = text.indexOf(char, cursor);
    if (index < 0) return { matches: false, score: 0 };
    // First letter: pay for how deep into the text the match starts.
    // Later letters: pay for the gap since the previous letter.
    score += previousIndex < 0 ? index * 0.1 : (index - previousIndex - 1) * 0.5;
    previousIndex = index;
    cursor = index + 1;
  }
  return { matches: true, score };
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const trimmed = query.trim();
  if (!trimmed) {
    return { mode: 'tokens', tokens: [], regex: null };
  }

  if (trimmed.startsWith('re:')) {
    const pattern = trimmed.slice(3).trim();
    if (!pattern) {
      return { mode: 'regex', tokens: [], regex: null, error: 'Empty regex' };
    }
    try {
      return { mode: 'regex', tokens: [], regex: new RegExp(pattern, 'i') };
    } catch (err) {
      return { mode: 'regex', tokens: [], regex: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const tokens: { kind: 'fuzzy' | 'phrase'; value: string }[] = [];
  let buf = '';
  let inQuote = false;
  let hadUnclosedQuote = false;

  const flush = (kind: 'fuzzy' | 'phrase'): void => {
    const value = buf.trim();
    buf = '';
    if (value) tokens.push({ kind, value });
  };

  for (const ch of trimmed) {
    if (ch === '"') {
      flush(inQuote ? 'phrase' : 'fuzzy');
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      flush('fuzzy');
      continue;
    }
    buf += ch;
  }

  if (inQuote) hadUnclosedQuote = true;

  // Unbalanced quotes are a half-typed query, not an error: fall back to plain
  // whitespace tokenization so results keep updating as the user types.
  if (hadUnclosedQuote) {
    return {
      mode: 'tokens',
      tokens: trimmed
        .split(/\s+/)
        .map(token => token.replace(/"/g, '').trim())
        .filter(token => token.length > 0)
        .map(value => ({ kind: 'fuzzy' as const, value })),
      regex: null,
    };
  }

  flush('fuzzy');
  return { mode: 'tokens', tokens, regex: null };
}

/** A fuzzy token this loose stops being a filter, so reject it. */
const STRICT_FUZZY_MAX_TOKEN_SCORE = 25;

/** Match a precomputed search corpus against an already-parsed query. */
export function matchSearchText(text: string, parsed: ParsedSearchQuery): SearchMatchResult {
  if (parsed.error) return { matches: false, score: 0 };

  if (parsed.mode === 'regex') {
    if (!parsed.regex) return { matches: false, score: 0 };
    const index = text.search(parsed.regex);
    return index < 0 ? { matches: false, score: 0 } : { matches: true, score: index * 0.1 };
  }

  if (parsed.tokens.length === 0) return { matches: true, score: 0 };

  const normalizedText = normalizeWhitespaceLower(text);
  let totalScore = 0;
  for (const token of parsed.tokens) {
    const needle = normalizeWhitespaceLower(token.value);
    if (!needle) continue;
    const index = normalizedText.indexOf(needle);
    if (index >= 0) {
      totalScore += index * 0.1;
      continue;
    }
    if (token.kind === 'phrase') return { matches: false, score: 0 };
    const fuzzy = fuzzyMatch(token.value, text);
    if (!fuzzy.matches || fuzzy.score > STRICT_FUZZY_MAX_TOKEN_SCORE) return { matches: false, score: 0 };
    totalScore += fuzzy.score;
  }
  return { matches: true, score: totalScore };
}

export function matchesSearchText(text: string, query: string): boolean {
  return matchSearchText(text, parseSearchQuery(query)).matches;
}
