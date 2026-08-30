/**
 * Core Taste Learner engine.
 * Orchestrates diff analysis, workflow habits, evidence collection, and confidence updates.
 */

import { EvidenceCollector } from '../evidence/collector.js';
import type { TasteEvidence, TasteLearningInput, TasteLearningResult, TasteRule, TasteStore } from '../types.js';
import { updateRuleConfidence } from './confidence.js';
import { findConflicts } from './conflict.js';
import { analyzeSemanticDiff, type SemanticPattern } from './diff-analyzer.js';
import { analyzeWorkflowSequence } from './workflow-learner.js';

export class TasteLearner {
  private store: TasteStore;
  private collector: EvidenceCollector;

  constructor(store: TasteStore) {
    this.store = store;
    this.collector = new EvidenceCollector(store);
  }

  async learn(input: TasteLearningInput): Promise<TasteLearningResult> {
    const created: TasteRule[] = [];
    const updated: TasteRule[] = [];
    const weakened: TasteRule[] = [];
    const evidenceList: TasteEvidence[] = [];

    // 1. Record Verifier Evidence
    if (input.verifier) {
      if (input.verifier.tests === true) {
        const ev = await this.collector.record({
          taskId: input.taskId,
          signal: 'test_pass',
          details: 'All tests passed successfully',
        });
        evidenceList.push(ev);
      } else if (input.verifier.tests === false) {
        const ev = await this.collector.record({
          taskId: input.taskId,
          signal: 'test_fail',
          details: 'Test execution failed',
        });
        evidenceList.push(ev);
      }

      if (input.verifier.build === true) {
        const ev = await this.collector.record({
          taskId: input.taskId,
          signal: 'build_pass',
          details: 'Build passed cleanly',
        });
        evidenceList.push(ev);
      } else if (input.verifier.build === false) {
        const ev = await this.collector.record({
          taskId: input.taskId,
          signal: 'build_fail',
          details: 'Build failed',
        });
        evidenceList.push(ev);
      }

      if (input.verifier.lint === true) {
        const ev = await this.collector.record({
          taskId: input.taskId,
          signal: 'lint_pass',
          details: 'Lint check clean',
        });
        evidenceList.push(ev);
      }
    }

    // 2. Record User Action Evidence
    if (input.userAction) {
      const _isPositive = input.userAction === 'accept';
      const ev = await this.collector.record({
        taskId: input.taskId,
        signal: input.userAction,
        before: input.generatedPatch,
        after: input.finalPatch,
        details: `User action: ${input.userAction}`,
      });
      evidenceList.push(ev);
    }

    // 3. Extract Semantic Patterns from Diffs and Workflow
    const patterns: SemanticPattern[] = [];

    if (input.generatedPatch && input.finalPatch) {
      const diffPatterns = analyzeSemanticDiff(input.generatedPatch, input.finalPatch, input.language);
      patterns.push(...diffPatterns);
    }

    if (input.toolSequence && input.toolSequence.length > 0) {
      const workflowPatterns = analyzeWorkflowSequence(input.toolSequence, input.prompt);
      patterns.push(...workflowPatterns);
    }

    // 4. Update or Create Rules from Patterns
    const existingRules = await this.store.list();

    for (const pattern of patterns) {
      const existing = existingRules.find(
        r => r.rule.toLowerCase() === pattern.rule.toLowerCase() || r.id.endsWith(this.slugify(pattern.rule)),
      );

      if (existing) {
        const { updatedRule } = updateRuleConfidence(existing, pattern.weight, true);
        await this.store.upsert(updatedRule);
        updated.push(updatedRule);

        // Record linked evidence
        const ev = await this.collector.record({
          taskId: input.taskId,
          ruleId: updatedRule.id,
          signal: 'accept',
          customWeight: pattern.weight,
          details: pattern.explanation,
        });
        evidenceList.push(ev);
      } else {
        // Create candidate rule
        const id = `${pattern.category}.${this.slugify(pattern.rule)}`;
        const now = new Date().toISOString();
        const candidateRule: TasteRule = {
          id,
          rule: pattern.rule,
          category: pattern.category,
          scope: {
            type: 'project',
            language: pattern.language,
          },
          confidence: 0.45, // Candidate threshold (0.30 - 0.59)
          status: 'candidate',
          source: 'learned',
          evidenceCount: 1,
          positiveEvidence: 1,
          negativeEvidence: 0,
          createdAt: now,
          updatedAt: now,
          lastObservedAt: now,
        };

        await this.store.upsert(candidateRule);
        created.push(candidateRule);

        const ev = await this.collector.record({
          taskId: input.taskId,
          ruleId: candidateRule.id,
          signal: 'edit',
          customWeight: pattern.weight,
          details: `Learned candidate rule: ${pattern.explanation}`,
        });
        evidenceList.push(ev);
      }
    }

    // 5. Conflict Detection
    const allCurrentRules = await this.store.list();
    const detectedConflicts = findConflicts(allCurrentRules);
    for (const conf of detectedConflicts) {
      await this.store.addConflict(conf);
    }

    return {
      created,
      updated,
      weakened,
      conflicts: detectedConflicts,
      evidence: evidenceList,
    };
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30)
      .replace(/^-|-$/g, '');
  }
}
