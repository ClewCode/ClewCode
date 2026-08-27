/**
 * Continual Self-Refinement Harness — 3-stage promotion gate with rollback.
 */

import type { ProposedRefinement, RefinementTarget, VerificationResult } from './types.js';

export class RefinementHarness {
  private refinements = new Map<string, ProposedRefinement>();

  /**
   * Stage 1: Propose a modification with rationale and provenance.
   */
  propose(options: {
    target: RefinementTarget;
    key: string;
    proposedContent: string;
    provenance: string;
    diffSummary: string;
    previousContent?: string;
  }): ProposedRefinement {
    const id = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const refinement: ProposedRefinement = {
      id,
      target: options.target,
      key: options.key,
      previousContent: options.previousContent,
      proposedContent: options.proposedContent,
      diffSummary: options.diffSummary,
      provenance: options.provenance,
      stage: 'proposed',
      createdAt: now,
      updatedAt: now,
    };

    this.refinements.set(id, refinement);
    return refinement;
  }

  /**
   * Stage 2: Verify proposal through an automated test, lint, or confidence validator.
   */
  verify(id: string, verifier: (proposal: ProposedRefinement) => VerificationResult): boolean {
    const proposal = this.refinements.get(id);
    if (proposal?.stage !== 'proposed') return false;

    const result = verifier(proposal);
    proposal.updatedAt = new Date().toISOString();

    if (result.passed) {
      proposal.stage = 'verified';
      proposal.verificationEvidence = result.reason;
      return true;
    }

    proposal.stage = 'rejected';
    proposal.verificationEvidence = `Verification failed: ${result.reason}`;
    return false;
  }

  /**
   * Stage 3: Activate verified proposal into active system prompts or skills.
   */
  activate(id: string): boolean {
    const proposal = this.refinements.get(id);
    if (proposal?.stage !== 'verified') return false;

    // Archive any previous active refinement for the same target and key
    for (const ref of this.refinements.values()) {
      if (ref.id !== id && ref.target === proposal.target && ref.key === proposal.key && ref.stage === 'active') {
        ref.stage = 'rolled_back';
        ref.updatedAt = new Date().toISOString();
      }
    }

    proposal.stage = 'active';
    proposal.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Rollback an active refinement to its previous state.
   */
  rollback(id: string): boolean {
    const proposal = this.refinements.get(id);
    if (proposal?.stage !== 'active') return false;

    proposal.stage = 'rolled_back';
    proposal.updatedAt = new Date().toISOString();
    return true;
  }

  getActive(target: RefinementTarget, key: string): ProposedRefinement | undefined {
    return Array.from(this.refinements.values()).find(
      r => r.target === target && r.key === key && r.stage === 'active',
    );
  }

  list(stage?: string): ProposedRefinement[] {
    const all = Array.from(this.refinements.values());
    return stage ? all.filter(r => r.stage === stage) : all;
  }

  clear(): void {
    this.refinements.clear();
  }
}

// Global Singleton
let globalRefinementHarness: RefinementHarness | null = null;
export function getRefinementHarness(): RefinementHarness {
  if (!globalRefinementHarness) {
    globalRefinementHarness = new RefinementHarness();
  }
  return globalRefinementHarness;
}
