import type { EvalTask, GraderConfig, GraderResult } from '../types.js';
import type { GraderContext } from './index.js';

export async function runRuleGrader(
  grader: GraderConfig,
  task: EvalTask,
  context: GraderContext,
): Promise<GraderResult> {
  const failureReasons: string[] = [];
  const output = context.agentOutput || '';

  const mustInclude = grader.mustInclude || [];
  const mustNotInclude = grader.mustNotInclude || [];

  for (const match of mustInclude) {
    if (!output.includes(match)) {
      failureReasons.push(`Rule Violation: Output was expected to include "${match}", but it did not.`);
    }
  }

  for (const match of mustNotInclude) {
    if (output.includes(match)) {
      failureReasons.push(`Rule Violation: Output contains forbidden string "${match}".`);
    }
  }

  const passed = failureReasons.length === 0;

  return {
    graderId: grader.id,
    status: passed ? 'pass' : 'fail',
    score: passed ? 1.0 : 0.0,
    failureReasons,
  };
}
