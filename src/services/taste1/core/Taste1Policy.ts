// Clew taste-1: Policy engine that combines rule-based and learned preferences

import type { BanditContext, Taste1Bandit } from './Taste1Bandit.js';
import type { Taste1NeuralScorer } from './Taste1NeuralScorer.js';
import type { Taste1SymbolicEngine } from './Taste1SymbolicEngine.js';
import { DEFAULT_TASTE1_CONFIG, type Taste1Config, type TasteBanditArm, type TasteRule } from './Taste1Types.js';

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
export class Taste1Policy {
  private symbolic: Taste1SymbolicEngine;
  private neural: Taste1NeuralScorer | null;
  private bandit: Taste1Bandit | null;

  constructor(
    symbolic: Taste1SymbolicEngine,
    neural: Taste1NeuralScorer | null,
    bandit: Taste1Bandit | null,
    config: Partial<Taste1Config> = {},
  ) {
    this.symbolic = symbolic;
    this.neural = neural;
    this.bandit = bandit;
    this.config = { ...DEFAULT_TASTE1_CONFIG, ...config };
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
