/**
 * Conflict detection and resolution for Taste rules.
 */

import type { TasteConflict, TasteRule } from '../types.js';

interface ConflictPattern {
  name: string;
  patternA: RegExp;
  patternB: RegExp;
  reason: string;
}

const KNOWN_CONFLICT_PATTERNS: ConflictPattern[] = [
  {
    name: 'exports',
    patternA: /prefer\s+named\s+exports/i,
    patternB: /prefer\s+default\s+exports/i,
    reason: 'Contradictory export style preferences (named exports vs default exports)',
  },
  {
    name: 'typing',
    patternA: /prefer\s+explicit\s+(?:return\s+)?types/i,
    patternB: /prefer\s+(?:type\s+)?inference/i,
    reason: 'Contradictory type annotation preferences (explicit types vs type inference)',
  },
  {
    name: 'indentation',
    patternA: /tabs/i,
    patternB: /spaces/i,
    reason: 'Contradictory indentation preferences (tabs vs spaces)',
  },
];

export function detectRuleConflict(ruleA: TasteRule, ruleB: TasteRule): TasteConflict | null {
  if (ruleA.id === ruleB.id) return null;
  if (ruleA.category !== ruleB.category) return null;

  for (const item of KNOWN_CONFLICT_PATTERNS) {
    const aMatchesA = item.patternA.test(ruleA.rule);
    const aMatchesB = item.patternB.test(ruleA.rule);
    const bMatchesA = item.patternA.test(ruleB.rule);
    const bMatchesB = item.patternB.test(ruleB.rule);

    if ((aMatchesA && bMatchesB) || (aMatchesB && bMatchesA)) {
      return {
        id: `conflict_${ruleA.id}_${ruleB.id}`,
        ruleIdA: ruleA.id,
        ruleIdB: ruleB.id,
        reason: item.reason,
        detectedAt: new Date().toISOString(),
        resolved: false,
      };
    }
  }

  return null;
}

export function findConflicts(rules: TasteRule[]): TasteConflict[] {
  const conflicts: TasteConflict[] = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const conflict = detectRuleConflict(rules[i]!, rules[j]!);
      if (conflict) {
        conflicts.push(conflict);
      }
    }
  }

  return conflicts;
}
