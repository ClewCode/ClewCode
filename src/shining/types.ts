export type PremonitionKind = 'next_intent' | 'needed_context' | 'risk' | 'next_tool' | 'missing_evidence';

export interface EvidenceRef {
  source: string;
  detail: string;
  weight?: number;
}

export interface Premonition {
  id: string;
  kind: PremonitionKind;
  prediction: string;
  confidence: number;
  evidence: EvidenceRef[];
  suggestedContext?: string[];
  expiresAt?: number;
  createdAt: number;
}

export type ShiningEvent =
  | { type: 'file_changed'; path: string; detail?: string }
  | { type: 'tool_result'; tool: string; success: boolean; detail?: string }
  | { type: 'user_intent'; text: string }
  | { type: 'task_update'; task: string; status: string }
  | { type: 'turn_end'; turn: number };

export interface ShiningContext {
  userIntent?: string;
  repoState?: string[];
  taskGraph?: string[];
  recentTurns?: string[];
  memorySummary?: string;
}
