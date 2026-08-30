/**
 * Workflow Habit Learner — learns agent execution habits and workflow conventions.
 */

import type { SemanticPattern } from './diff-analyzer.js';

export function analyzeWorkflowSequence(toolSequence?: string[], prompt?: string): SemanticPattern[] {
  if (!toolSequence || toolSequence.length < 2) return [];

  const patterns: SemanticPattern[] = [];
  const _seq = toolSequence.join(' -> ');

  // 1. Search before Edit habit
  const hasSearch = toolSequence.some(
    t => t.toLowerCase().includes('grep') || t.toLowerCase().includes('glob') || t.toLowerCase().includes('search'),
  );
  const hasEdit = toolSequence.some(t => t.toLowerCase().includes('edit') || t.toLowerCase().includes('write'));

  if (hasSearch && hasEdit) {
    const searchIdx = toolSequence.findIndex(
      t => t.toLowerCase().includes('grep') || t.toLowerCase().includes('glob') || t.toLowerCase().includes('search'),
    );
    const editIdx = toolSequence.findIndex(t => t.toLowerCase().includes('edit') || t.toLowerCase().includes('write'));

    if (searchIdx < editIdx) {
      patterns.push({
        category: 'workflow',
        rule: 'Prefer searching and inspecting codebase before editing files.',
        weight: 0.25,
        explanation: 'Agent successfully searched and located code before modifying files',
      });
    }
  }

  // 2. Read before Edit habit
  const hasRead = toolSequence.some(t => t.toLowerCase().includes('read'));
  if (hasRead && hasEdit) {
    const readIdx = toolSequence.findIndex(t => t.toLowerCase().includes('read'));
    const editIdx = toolSequence.findIndex(t => t.toLowerCase().includes('edit') || t.toLowerCase().includes('write'));

    if (readIdx < editIdx) {
      patterns.push({
        category: 'workflow',
        rule: 'Prefer reading existing file implementation before modifying it.',
        weight: 0.2,
        explanation: 'Agent read file before executing edit tool',
      });
    }
  }

  // 3. Targeted test runner preference
  if (prompt && /test/i.test(prompt) && toolSequence.some(t => t.toLowerCase().includes('bash'))) {
    patterns.push({
      category: 'workflow',
      rule: 'Run targeted tests for changed files before running the full test suite.',
      weight: 0.2,
      explanation: 'Targeted testing workflow observed',
    });
  }

  return patterns;
}
