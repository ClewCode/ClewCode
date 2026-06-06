// Clew taste: Run evaluations against the current profile

import { TasteNeuralScorer } from '../core/TasteNeuralScorer.js';
import { TasteSymbolicEngine } from '../core/TasteSymbolicEngine.js';
import type { TasteProfile } from '../core/TasteTypes.js';
import { TasteVectorStore } from '../storage/TasteVectorStore.js';

export type EvalResult = {
  totalRules: number;
  highConfidenceRules: number;
  staleRules: number;
  symbolicChecks: Array<{ ruleId: string; passed: boolean; reason: string }>;
  neuralScore: number;
  coverageByKind: Record<string, number>;
  summary: string;
};

/**
 * Run a self-evaluation of the current taste profile.
 * Checks rule health, coverage gaps, and symbolic consistency.
 */
export class TasteEvaluator {
  private symbolic: TasteSymbolicEngine;
  private neural: TasteNeuralScorer;
  private vectorStore: TasteVectorStore;

  constructor() {
    this.vectorStore = new TasteVectorStore();
    this.symbolic = new TasteSymbolicEngine(0.3, 0.85);
    this.neural = new TasteNeuralScorer(this.vectorStore, true);
  }

  /**
   * Evaluate the full profile.
   */
  evaluate(profile: TasteProfile, sampleOutput?: string): EvalResult {
    const rules = profile.rules;
    const highConfidenceRules = rules.filter(r => r.confidence >= 0.7).length;
    const staleRules = rules.filter(r => r.confidence < 0.4).length;

    // Symbolic checks
    const symbolicChecks = rules.slice(0, 20).map(rule => {
      const result = this.symbolic.evaluate(rule.text, [rule]);
      return {
        ruleId: rule.id,
        passed: result.constraints[0]?.passed ?? true,
        reason: result.constraints[0]?.reason ?? 'No constraints',
      };
    });

    // Neural score
    const neuralScore = sampleOutput ? this.neural.scoreOutput(sampleOutput, rules).score : rules.length > 0 ? 0.5 : 0;

    // Coverage by kind
    const coverageByKind: Record<string, number> = {};
    for (const rule of rules) {
      coverageByKind[rule.kind] = (coverageByKind[rule.kind] ?? 0) + 1;
    }

    const summary = this.buildSummary(rules.length, highConfidenceRules, staleRules, coverageByKind);

    return {
      totalRules: rules.length,
      highConfidenceRules,
      staleRules,
      symbolicChecks,
      neuralScore,
      coverageByKind,
      summary,
    };
  }

  private buildSummary(total: number, high: number, stale: number, coverage: Record<string, number>): string {
    const parts: string[] = [`Profile: ${total} rules (${high} high-confidence, ${stale} stale)`];

    const kinds = Object.entries(coverage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([kind, count]) => `${kind}:${count}`)
      .join(', ');
    if (kinds) parts.push(`Coverage: ${kinds}`);

    if (stale > total * 0.3) {
      parts.push('Warning: high proportion of stale rules — consider pruning');
    }

    return parts.join('\n');
  }
}
