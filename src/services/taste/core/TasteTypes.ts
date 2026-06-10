// Clew taste: Local-first preference-learning runtime types

export type TasteSignalType =
  | 'accept'
  | 'reject'
  | 'edit'
  | 'manual_rule'
  | 'tool_success'
  | 'tool_failure'
  | 'test_pass'
  | 'test_fail'
  | 'lint_pass'
  | 'lint_fail';

export type TasteRuleKind =
  | 'style'
  | 'architecture'
  | 'tooling'
  | 'testing'
  | 'naming'
  | 'security'
  | 'performance'
  | 'ui'
  | 'workflow';

export type TasteRuleSource = 'manual' | 'inferred' | 'imported';

export type TasteFeedbackPriority = 'low' | 'medium' | 'high' | 'immediate';

export type TasteRule = {
  id: string;
  kind: TasteRuleKind;
  scope: 'project' | 'global';
  text: string;
  confidence: number;
  weight: number;
  source: TasteRuleSource;
  positiveEvidence: number;
  negativeEvidence: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  decayRate: number;
  tags: string[];
};

export type TasteEvent = {
  id: string;
  type: TasteSignalType;
  timestamp: string;
  sessionId?: string;
  prompt?: string;
  filePaths?: string[];
  before?: string;
  after?: string;
  diff?: string;
  model?: string;
  provider?: string;
  reward: number;
  metadata?: Record<string, unknown>;
};

export type TasteBanditArm =
  | 'minimal'
  | 'strict_style'
  | 'architecture_first'
  | 'test_first'
  | 'safety_first'
  | 'refactor_heavy';

export type TasteBanditState = {
  arms: Record<
    TasteBanditArm,
    {
      pulls: number;
      totalReward: number;
      averageReward: number;
    }
  >;
  epsilon: number;
  updatedAt: string;
};

export type TasteProfile = {
  version: 1;
  projectId: string;
  rules: TasteRule[];
  bandit: TasteBanditState;
  stats: {
    totalEvents: number;
    totalAccepts: number;
    totalRejects: number;
    totalEdits: number;
    lastUpdatedAt: string;
  };
};

export const DEFAULT_BANDIT_STATE: TasteBanditState = {
  arms: {
    minimal: { pulls: 1, totalReward: 0.5, averageReward: 0.5 },
    strict_style: { pulls: 1, totalReward: 0.5, averageReward: 0.5 },
    architecture_first: { pulls: 1, totalReward: 0.5, averageReward: 0.5 },
    test_first: { pulls: 1, totalReward: 0.5, averageReward: 0.5 },
    safety_first: { pulls: 1, totalReward: 0.5, averageReward: 0.5 },
    refactor_heavy: { pulls: 1, totalReward: 0.5, averageReward: 0.5 },
  },
  epsilon: 0.2,
  updatedAt: new Date().toISOString(),
};

export const REWARD_VALUES: Record<TasteSignalType, number> = {
  accept: 1.0,
  reject: -1.0,
  manual_rule: 0.8,
  test_pass: 0.4,
  test_fail: -0.4,
  lint_pass: 0.2,
  lint_fail: -0.2,
  tool_success: 0.1,
  tool_failure: -0.2,
  edit: 0, // computed dynamically from edit distance
};

export const EDIT_REWARD = {
  tiny: 0.7, // <10% changed
  medium: 0.2, // 10-40% changed
  heavy: -0.4, // >40% changed
} as const;

export const DEFAULT_TOLERANCES: TasteTolerances = {
  minConfidence: 0.55,
  blockThreshold: 0.85,
  maxInjectedRules: 8,
  decayHalfLifeDays: 30,
  banditEpsilon: 0.2,
};

export type TasteTolerances = {
  minConfidence: number;
  blockThreshold: number;
  maxInjectedRules: number;
  decayHalfLifeDays: number;
  banditEpsilon: number;
};

export type TasteConfig = {
  enabled: boolean;
  autoLearn: boolean;
  injectPrompts: boolean;
  validateEdits: boolean;
  minConfidence: number;
  maxInjectedRules: number;
  decayEnabled: boolean;
  banditEnabled: boolean;
  neuralScoringEnabled: boolean;
};

export const DEFAULT_TASTE_CONFIG: TasteConfig = {
  enabled: true,
  autoLearn: true,
  injectPrompts: true,
  validateEdits: true,
  minConfidence: 0.55,
  maxInjectedRules: 8,
  decayEnabled: true,
  banditEnabled: true,
  neuralScoringEnabled: true,
};
