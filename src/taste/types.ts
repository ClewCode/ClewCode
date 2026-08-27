/**
 * Core types and data contracts for the Taste Learning subsystem.
 */

export type TasteCategory = 'coding' | 'architecture' | 'testing' | 'tooling' | 'workflow' | 'language';

export type TasteStatus = 'candidate' | 'active' | 'weak' | 'conflicted' | 'disabled';

export type TasteSource = 'explicit' | 'learned';

export type TasteSignal =
  | 'accept'
  | 'reject'
  | 'edit'
  | 'revert'
  | 'test_pass'
  | 'test_fail'
  | 'build_pass'
  | 'build_fail'
  | 'lint_pass'
  | 'lint_fail'
  | 'review_accept'
  | 'review_reject';

export interface TasteScope {
  type: 'global' | 'project';
  language?: string;
  repository?: string;
}

export interface TasteRule {
  id: string;
  rule: string;
  category: TasteCategory;
  scope: TasteScope;
  confidence: number;
  status: TasteStatus;
  source: TasteSource;
  evidenceCount: number;
  positiveEvidence: number;
  negativeEvidence: number;
  createdAt: string;
  updatedAt: string;
  lastObservedAt: string;
}

export interface TasteEvidence {
  id: string;
  taskId: string;
  ruleId?: string;
  signal: TasteSignal;
  weight: number;
  before?: string;
  after?: string;
  filePath?: string;
  details?: string;
  timestamp: string;
}

export interface TasteConflict {
  id: string;
  ruleIdA: string;
  ruleIdB: string;
  reason: string;
  detectedAt: string;
  resolved: boolean;
}

export interface TasteQuery {
  category?: TasteCategory;
  scopeType?: 'global' | 'project';
  language?: string;
  status?: TasteStatus | TasteStatus[];
  minConfidence?: number;
  search?: string;
  limit?: number;
}

export interface TaskContext {
  prompt?: string;
  language?: string;
  repository?: string;
  category?: TasteCategory;
}

export interface TasteLearningInput {
  taskId: string;
  prompt: string;
  language?: string;
  generatedPatch?: string;
  finalPatch?: string;
  userAction?: 'accept' | 'edit' | 'reject' | 'revert';
  verifier?: {
    build?: boolean;
    tests?: boolean;
    lint?: boolean;
    review?: boolean;
  };
  toolSequence?: string[];
  existingTaste?: TasteRule[];
}

export interface TasteLearningResult {
  created: TasteRule[];
  updated: TasteRule[];
  weakened: TasteRule[];
  conflicts: TasteConflict[];
  evidence: TasteEvidence[];
}

export interface TasteStore {
  get(id: string): Promise<TasteRule | null>;
  list(query?: TasteQuery): Promise<TasteRule[]>;
  upsert(rule: TasteRule): Promise<void>;
  disable(id: string): Promise<boolean>;
  enable(id: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  clear(scopeType?: 'global' | 'project'): Promise<void>;

  // Evidence methods
  addEvidence(evidence: TasteEvidence): Promise<void>;
  getEvidenceForRule(ruleId: string): Promise<TasteEvidence[]>;
  getRecentEvidence(limit?: number): Promise<TasteEvidence[]>;

  // Conflict methods
  addConflict(conflict: TasteConflict): Promise<void>;
  getConflicts(unresolvedOnly?: boolean): Promise<TasteConflict[]>;
  resolveConflict(conflictId: string): Promise<boolean>;

  close(): void;
}
