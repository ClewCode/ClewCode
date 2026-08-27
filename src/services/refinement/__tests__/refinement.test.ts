import { beforeEach, describe, expect, it } from 'bun:test';
import { RefinementHarness } from '../harness.js';

describe('Versioned Continual Self-Refinement Harness', () => {
  let harness: RefinementHarness;

  beforeEach(() => {
    harness = new RefinementHarness();
  });

  it('progresses refinement through proposed -> verified -> active stages', () => {
    // 1. Propose
    const proposal = harness.propose({
      target: 'skill',
      key: 'excalidraw_diagram_skill',
      proposedContent: '# Improved Excalidraw Skill instructions',
      diffSummary: 'Added strict schema validation',
      provenance: 'Observed syntax errors in 3 user turns',
    });

    expect(proposal.stage).toBe('proposed');

    // 2. Verify
    const verifySuccess = harness.verify(proposal.id, p => {
      expect(p.key).toBe('excalidraw_diagram_skill');
      return { passed: true, reason: 'Passed AST syntax check' };
    });

    expect(verifySuccess).toBe(true);
    expect(proposal.stage).toBe('verified');

    // 3. Activate
    const activateSuccess = harness.activate(proposal.id);
    expect(activateSuccess).toBe(true);
    expect(proposal.stage).toBe('active');

    const active = harness.getActive('skill', 'excalidraw_diagram_skill');
    expect(active).toBeDefined();
    expect(active!.id).toBe(proposal.id);
  });

  it('rejects proposal when verification fails', () => {
    const proposal = harness.propose({
      target: 'rule',
      key: 'strict_typing_rule',
      proposedContent: 'Always require `as const`',
      diffSummary: 'Forced constant assertion',
      provenance: 'Self-generated',
    });

    const verifySuccess = harness.verify(proposal.id, () => ({
      passed: false,
      reason: 'Failed typecheck suite',
    }));

    expect(verifySuccess).toBe(false);
    expect(proposal.stage).toBe('rejected');

    // Cannot activate rejected proposal
    expect(harness.activate(proposal.id)).toBe(false);
  });

  it('rolls back active refinement when instructed', () => {
    const proposal = harness.propose({
      target: 'taste',
      key: 'export_style',
      proposedContent: 'Prefer default export',
      diffSummary: 'Switch to default export',
      provenance: 'User feedback',
    });

    harness.verify(proposal.id, () => ({ passed: true, reason: 'OK' }));
    harness.activate(proposal.id);
    expect(proposal.stage).toBe('active');

    const rollbackSuccess = harness.rollback(proposal.id);
    expect(rollbackSuccess).toBe(true);
    expect(proposal.stage).toBe('rolled_back');

    expect(harness.getActive('taste', 'export_style')).toBeUndefined();
  });
});
