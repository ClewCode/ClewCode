// Clew taste-1: Compile symbolic rules into enforceable edit constraints

import type { TasteRule, TasteRuleKind } from '../core/Taste1Types.js';

export type EditConstraint = {
  ruleId: string;
  kind: TasteRuleKind;
  description: string;
  priority: 'high' | 'medium' | 'low';
  check: (before: string, after: string) => ConstraintCheckResult;
};

export type ConstraintCheckResult = {
  passed: boolean;
  message?: string;
};

/**
 * Compiles high-confidence rules into executable constraint checks.
 * Only rules with confidence >= 0.55 produce constraints.
 * Rules with confidence >= 0.85 produce high-priority blocking constraints.
 */
export class TasteConstraintCompiler {
  private minConfidence: number;
  private blockThreshold: number;

  constructor(minConfidence = 0.55, blockThreshold = 0.85) {
    this.minConfidence = minConfidence;
    this.blockThreshold = blockThreshold;
  }

  /**
   * Compile rules into constraints.
   * For now, all rules produce the same general-purpose style constraint.
   * As the system evolves, rules can produce more specific checks
   * (e.g., naming rules produce identifier checks).
   */
  compile(rules: TasteRule[]): EditConstraint[] {
    const constraints: EditConstraint[] = [];

    for (const rule of rules) {
      if (rule.confidence < this.minConfidence) continue;

      const priority = rule.confidence >= this.blockThreshold ? 'high' : rule.confidence >= 0.7 ? 'medium' : 'low';

      constraints.push({
        ruleId: rule.id,
        kind: rule.kind,
        description: rule.text,
        priority,
        check: (_before: string, _after: string) => {
          // Basic keyword presence check
          const keywords = this.extractKeywords(rule.text);
          if (keywords.length === 0) return { passed: true };

          const afterLower = _after.toLowerCase();
          const violations = keywords.filter(kw => !afterLower.includes(kw));

          if (violations.length === 0) return { passed: true };

          if (priority === 'high') {
            return {
              passed: false,
              message: `Edit violates rule: "${rule.text}" — missing expected pattern(s): ${violations.join(', ')}`,
            };
          }

          return { passed: true, message: `Note: edit may not follow "${rule.text}"` };
        },
      });
    }

    return constraints;
  }

  private extractKeywords(text: string): string[] {
    return [
      ...new Set(
        text
          .toLowerCase()
          .replace(/[^a-z0-9_\s]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length > 3),
      ),
    ];
  }
}
