// Clew taste: Policy engine that combines rule-based and learned preferences

import type { BanditContext, TasteBandit } from './TasteBandit.js';
import type { TasteNeuralScorer } from './TasteNeuralScorer.js';
import type { TasteSymbolicEngine } from './TasteSymbolicEngine.js';
import { DEFAULT_TASTE_CONFIG, type TasteBanditArm, type TasteConfig, type TasteRule } from './TasteTypes.js';

export type PolicyDecision = {
  shouldBlock: boolean;
  reason?: string;
  constraints: Array<{ ruleId: string; passed: boolean; reason: string }>;
  banditArm: TasteBanditArm;
  neuralScore: number;
};

/**
 * Policy engine: combines symbolic rules, neural scoring, and bandit
 * to make runtime decisions about output quality and blocking.
 */
export class TastePolicy {
  private symbolic: TasteSymbolicEngine;
  private neural: TasteNeuralScorer | null;
  private bandit: TasteBandit | null;

  constructor(
    symbolic: TasteSymbolicEngine,
    neural: TasteNeuralScorer | null,
    bandit: TasteBandit | null,
    config: Partial<TasteConfig> = {},
  ) {
    this.symbolic = symbolic;
    this.neural = neural;
    this.bandit = bandit;
    this.config = { ...DEFAULT_TASTE_CONFIG, ...config };
  }

  /**
   * Evaluate output against all active policies.
   */
  evaluate(output: string, rules: TasteRule[], banditContext?: BanditContext): PolicyDecision {
    // Symbolic evaluation
    const symbolicResult = this.symbolic.evaluate(output, rules);

    // Neural scoring
    const neuralScore = this.neural
      ? this.neural.scoreOutput(output, rules)
      : { score: 0.5, matchedRuleIds: [], explanation: 'Neural scoring not available' };

    // Bandit arm selection
    const banditArm = this.bandit ? this.bandit.selectArm(banditContext) : 'minimal';

    const blocked = symbolicResult.blocked;

    return {
      shouldBlock: blocked,
      reason: blocked ? symbolicResult.summary : undefined,
      constraints: symbolicResult.constraints.map(c => ({
        ruleId: c.ruleId,
        passed: c.passed,
        reason: c.reason,
      })),
      banditArm,
      neuralScore: neuralScore.score,
    };
  }
}
