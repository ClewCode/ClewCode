/**
 * Core types and data contracts for the Taste Learning subsystem.
 */

export type TasteCategory = 'coding' | 'architecture' | 'testing' | 'tooling' | 'workflow' | 'language';

export type TasteStatus = 'candidate' | 'active' | 'weak' | 'conflicted' | 'disabled';

export type TasteSource = 'explicit' | 'learned';

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

export interface TasteStore {
  get(id: string): Promise<TasteRule | null>;
  list(query?: TasteQuery): Promise<TasteRule[]>;
  upsert(rule: TasteRule): Promise<void>;
  disable(id: string): Promise<boolean>;
  enable(id: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  clear(scopeType?: 'global' | 'project'): Promise<void>;
  close(): void;
}
