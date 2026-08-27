/**
 * Types and contracts for Versioned Continual Self-Refinement Harness.
 */

export type RefinementTarget = 'skill' | 'taste' | 'prompt_section' | 'rule';
export type RefinementStage = 'proposed' | 'verified' | 'active' | 'rejected' | 'rolled_back';

export interface ProposedRefinement {
  id: string;
  target: RefinementTarget;
  key: string;
  previousContent?: string;
  proposedContent: string;
  diffSummary: string;
  provenance: string; // Rationale & origin
  stage: RefinementStage;
  verificationEvidence?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationResult {
  passed: boolean;
  score?: number;
  reason: string;
}
