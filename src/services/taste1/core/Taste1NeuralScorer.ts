// Clew taste-1: Semantic/lexical scorer for candidate output against learned rules
// Provider-agnostic: uses lexical similarity fallback (Jaccard/TF-IDF)
// If an embedding service is available via the existing provider system,
// this module can be extended to use it.

import type { TasteVectorStore } from '../storage/TasteVectorStore.js';
import type { TasteRule } from './Taste1Types.js';

export type NeuralScore = {
  score: number; // 0-1
  matchedRuleIds: string[];
  explanation: string;
};

/**
 * Neural scorer: scores candidate output against active rules and previous
 * accepted examples. Returns a score from 0 to 1.
 *
 * Currently uses lexical similarity. Extensible to use provider embeddings
 * when available.
 */
export class Taste1NeuralScorer {
  private vectorStore: TasteVectorStore;
  private enabled: boolean;

  constructor(vectorStore: TasteVectorStore, enabled = true) {
    this.vectorStore = vectorStore;
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Score generated output against active rules.
   * Higher score = better alignment with learned preferences.
   */
  scoreOutput(output: string, rules: TasteRule[]): NeuralScore {
    if (!this.enabled) {
      return { score: 0.5, matchedRuleIds: [], explanation: 'Neural scoring disabled' };
    }

    // Update vector store with current rules
    for (const rule of rules) {
      if (rule.confidence >= 0.4) {
        this.vectorStore.add(rule.id, rule.text, rule.tags, rule.kind);
      }
    }

    const similar = this.vectorStore.scoreSimilarity(output);
    const outputScore = this.vectorStore.scoreOutput(output);

    // Get matched rules above threshold
    const matched = similar.filter(s => s.score > 0.15);

    // Blend: vector similarity (50%) + direct output score (50%)
    const avgSimilarity = matched.length > 0 ? matched.reduce((sum, m) => sum + m.score, 0) / matched.length : 0.5;
    const finalScore = avgSimilarity * 0.5 + outputScore * 0.5;

    const explanation =
      matched.length > 0
        ? `Matched ${matched.length} rules, avg similarity ${avgSimilarity.toFixed(3)}`
        : 'No close rule matches';

    return {
      score: Math.max(0, Math.min(1, finalScore)),
      matchedRuleIds: matched.map(m => m.id),
      explanation,
    };
  }
}
