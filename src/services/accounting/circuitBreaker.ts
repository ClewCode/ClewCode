/**
 * Circuit Breaker for recursive subagent spawning and subtree budget limits.
 */

import { type CircuitBreakerConfig, DEFAULT_CIRCUIT_BREAKER_CONFIG, type TokenUsageMetrics } from './types.js';

export class CircuitBreaker {
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Checks whether spawning a subagent at a given depth and child count is permitted.
   */
  canSpawnChild(currentDepth: number, currentActiveChildrenCount: number): { allowed: boolean; reason?: string } {
    if (currentDepth >= this.config.maxDepth) {
      return {
        allowed: false,
        reason: `Max agent recursion depth exceeded (${currentDepth}/${this.config.maxDepth}). Runaway subagent spawn blocked.`,
      };
    }

    if (currentActiveChildrenCount >= this.config.maxChildrenPerAgent) {
      return {
        allowed: false,
        reason: `Max concurrent subagents reached (${currentActiveChildrenCount}/${this.config.maxChildrenPerAgent}).`,
      };
    }

    return { allowed: true };
  }

  /**
   * Checks whether a subtree has exceeded its token or cost quota.
   */
  checkSubtreeBudget(metrics: TokenUsageMetrics): { allowed: boolean; reason?: string } {
    const totalTokens = metrics.inputTokens + metrics.outputTokens + metrics.cacheReadTokens + metrics.cacheWriteTokens;
    if (totalTokens > this.config.maxSubtreeTokens) {
      return {
        allowed: false,
        reason: `Subtree token budget exceeded (${totalTokens.toLocaleString()} > ${this.config.maxSubtreeTokens.toLocaleString()} tokens).`,
      };
    }

    if (metrics.costUsd > this.config.maxSubtreeCostUsd) {
      return {
        allowed: false,
        reason: `Subtree cost budget exceeded ($${metrics.costUsd.toFixed(2)} > $${this.config.maxSubtreeCostUsd.toFixed(2)}).`,
      };
    }

    return { allowed: true };
  }
}
