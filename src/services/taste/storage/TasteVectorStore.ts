// Clew taste-1: Lightweight in-memory vector store for rule similarity
// Provider-agnostic: uses lexical (Jaccard/TF-IDF) fallback when no embedding API available

type StoredVector = {
  id: string;
  text: string;
  tags: string[];
  kind: string;
};

export class TasteVectorStore {
  private items: StoredVector[] = [];

  add(id: string, text: string, tags: string[], kind: string): void {
    // Remove old entry if exists
    this.items = this.items.filter(i => i.id !== id);
    this.items.push({ id, text, tags, kind });
  }

  remove(id: string): void {
    this.items = this.items.filter(i => i.id !== id);
  }

  clear(): void {
    this.items = [];
  }

  getItems(): StoredVector[] {
    return [...this.items];
  }

  /**
   * Score similarity between a query and stored rules using lexical overlap.
   * This is a safe fallback when no embedding system is available.
   */
  scoreSimilarity(query: string): Array<{ id: string; score: number }> {
    const queryTokens = this.tokenize(query);
    const results: Array<{ id: string; score: number }> = [];

    for (const item of this.items) {
      const itemTokens = this.tokenize(item.text);
      const intersection = queryTokens.filter(t => itemTokens.includes(t)).length;
      const union = new Set([...queryTokens, ...itemTokens]).size;
      const jaccard = union > 0 ? intersection / union : 0;

      // Tag overlap bonus
      const queryWords = query.toLowerCase().split(/\s+/);
      const tagBonus = item.tags.filter(t => queryWords.some(w => w.includes(t))).length * 0.05;

      results.push({
        id: item.id,
        score: Math.min(1, jaccard + tagBonus),
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Score a candidate output text against stored rules.
   * Returns a score 0-1 indicating how well it matches learned preferences.
   */
  scoreOutput(output: string): number {
    if (this.items.length === 0) return 0.5; // neutral
    const outputTokens = this.tokenize(output);
    if (outputTokens.length === 0) return 0.5;

    let totalScore = 0;
    for (const item of this.items) {
      const itemTokens = this.tokenize(item.text);
      const intersection = outputTokens.filter(t => itemTokens.includes(t)).length;
      const union = new Set([...outputTokens, ...itemTokens]).size;
      totalScore += union > 0 ? intersection / union : 0;
    }
    return Math.min(1, totalScore / this.items.length);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !STOP_WORDS.has(t));
  }
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'dare',
  'ought',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'up',
  'about',
  'into',
  'over',
  'after',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'because',
  'as',
  'until',
  'while',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'you',
  'your',
  'we',
  'our',
  'they',
  'their',
  'them',
  'which',
  'who',
  'whom',
  'what',
  'when',
  'where',
  'why',
  'how',
]);
