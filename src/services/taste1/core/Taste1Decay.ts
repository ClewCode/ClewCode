// Clew taste-1: Rule confidence decay over time
// Stale rules gradually lose confidence to prevent outdated preferences

import type { TasteRule } from './Taste1Types.js';

const MS_PER_DAY = 86400 * 1000;

/**
 * Decay engine: reduces rule confidence for rules not used recently.
 * A rule loses half its excess confidence above 0.5 every half-life.
 */
export class Taste1Decay {
  private halfLifeDays: number;
  private enabled: boolean;

  constructor(halfLifeDays = 30, enabled = true) {
    this.halfLifeDays = halfLifeDays;
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setHalfLife(days: number): void {
    this.halfLifeDays = days;
  }

  /**
   * Apply decay to a single rule based on time since last use.
   * Returns the decayed rule (mutates in place).
   */
  applyDecay(rule: TasteRule, now?: Date): TasteRule {
    if (!this.enabled) return rule;

    const currentTime = now ?? new Date();
    const lastUsed = rule.lastUsedAt ? new Date(rule.lastUsedAt) : new Date(rule.createdAt);
    const daysSinceUse = (currentTime.getTime() - lastUsed.getTime()) / MS_PER_DAY;

    if (daysSinceUse <= 0) return rule;

    // Half-life decay on excess confidence above 0.5
    const halfLives = daysSinceUse / this.halfLifeDays;
    const excessConfidence = rule.confidence - 0.5;

    if (excessConfidence <= 0) return rule;

    const decayedExcess = excessConfidence * 0.5 ** halfLives;
    rule.confidence = Math.max(0.5, 0.5 + decayedExcess);
    rule.updatedAt = currentTime.toISOString();

    return rule;
  }

  /**
   * Apply decay to multiple rules.
   */
  applyDecayToRules(rules: TasteRule[]): TasteRule[] {
    if (!this.enabled) return rules;
    const now = new Date();
    return rules.map(rule => this.applyDecay({ ...rule }, now));
  }

  /**
   * Get rules that should be considered stale (confidence below threshold).
   */
  getStaleRules(rules: TasteRule[], threshold = 0.5): TasteRule[] {
    const _now = new Date();
    return this.applyDecayToRules(rules).filter(r => r.confidence <= threshold);
  }
}
