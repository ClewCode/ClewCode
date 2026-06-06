// Clew taste: Contextual bandit for arm selection and learning
// Implements epsilon-greedy strategy with context features

import { DEFAULT_BANDIT_STATE, type TasteBanditArm, type TasteBanditState } from './TasteTypes.js';

export type BanditContext = {
  fileExtension?: string;
  commandType?: string;
  promptIntent?: string;
  modelProvider?: string;
  activeRuleKinds?: string[];
};

/**
 * Epsilon-greedy bandit that selects optimal strategies based on feedback.
 */
export class TasteBandit {
  private state: TasteBanditState;
  private epsilon: number;
  private enabled: boolean;

  constructor(state?: TasteBanditState, epsilon = 0.2, enabled = true) {
    this.state = state ?? { ...DEFAULT_BANDIT_STATE, updatedAt: new Date().toISOString() };
    this.epsilon = epsilon;
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getState(): TasteBanditState {
    return this.state;
  }

  setState(state: TasteBanditState): void {
    this.state = state;
  }

  /**
   * Select an arm using epsilon-greedy.
   * - With probability epsilon: explore (random arm)
   * - With probability 1-epsilon: exploit (best arm)
   */
  selectArm(_context?: BanditContext): TasteBanditArm {
    if (!this.enabled) return 'minimal';

    const arms = Object.keys(this.state.arms) as TasteBanditArm[];

    // Explore with probability epsilon
    if (Math.random() < this.epsilon) {
      // Weighted exploration: prefer arms with fewer pulls
      return this.weightedRandomArm(arms);
    }

    // Exploit: pick the arm with highest average reward
    return this.bestArm(arms);
  }

  /**
   * Update arm statistics after receiving feedback.
   */
  updateArm(arm: TasteBanditArm, reward: number): void {
    if (!this.enabled) return;

    const armState = this.state.arms[arm];
    armState.pulls++;
    armState.totalReward += reward;
    armState.averageReward = armState.totalReward / armState.pulls;
    this.state.updatedAt = new Date().toISOString();
  }

  /**
   * Decay epsilon over time (explore less as we learn more).
   */
  decayEpsilon(factor = 0.99, min = 0.05): void {
    this.epsilon = Math.max(min, this.epsilon * factor);
    this.state.epsilon = this.epsilon;
  }

  setEpsilon(value: number): void {
    this.epsilon = Math.max(0, Math.min(1, value));
    this.state.epsilon = this.epsilon;
  }

  private bestArm(arms: TasteBanditArm[]): TasteBanditArm {
    let best = arms[0];
    let bestScore = this.state.arms[best].averageReward;

    for (const arm of arms.slice(1)) {
      const score = this.state.arms[arm].averageReward;
      if (score > bestScore) {
        bestScore = score;
        best = arm;
      }
    }

    return best;
  }

  private weightedRandomArm(arms: TasteBanditArm[]): TasteBanditArm {
    const totalPulls = arms.reduce((sum, a) => sum + this.state.arms[a].pulls, 0);
    const weights = arms.map(a => 1 / (1 + this.state.arms[a].pulls / Math.max(1, totalPulls)));

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let r = Math.random() * totalWeight;

    for (let i = 0; i < arms.length; i++) {
      r -= weights[i];
      if (r <= 0) return arms[i];
    }

    return arms[arms.length - 1];
  }
}
