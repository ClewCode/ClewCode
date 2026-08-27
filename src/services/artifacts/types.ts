/**
 * Types and contracts for RetainedArtifactStore (L2 out-of-context ephemeral state).
 */

export type ArtifactType = 'text' | 'json' | 'diff' | 'test_output' | 'search_result' | 'log';

export interface RetainedArtifactMetadata {
  id: string;
  handle: string;
  type: ArtifactType;
  label: string;
  ownerAgentId: string;
  tokenEstimate: number;
  createdTurn: number;
  createdAt: string;
  expiresAt?: string;
  ttlMs?: number;
}

export interface RetainedArtifact extends RetainedArtifactMetadata {
  content: string;
}

export interface PutArtifactOptions {
  type: ArtifactType;
  label: string;
  ownerAgentId: string;
  content: string;
  createdTurn?: number;
  ttlMs?: number;
}
