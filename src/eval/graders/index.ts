import type { EvalTask, GraderConfig, GraderResult } from '../types.js';
import { runArtifactGrader } from './artifact.js';
import { runCommandGrader } from './command.js';
import { runRuleGrader } from './rule.js';
import { runTraceGrader } from './trace.js';

export interface GraderContext {
  workspaceDir: string;
  tracePath?: string;
  agentOutput?: string;
  changedFiles?: string[];
}

export async function gradeWithGrader(
  grader: GraderConfig,
  task: EvalTask,
  context: GraderContext,
): Promise<GraderResult> {
  try {
    switch (grader.type) {
      case 'command':
        return await runCommandGrader(grader, task, context);
      case 'trace':
        return await runTraceGrader(grader, task, context);
      case 'artifact':
        return await runArtifactGrader(grader, task, context);
      case 'rule':
        return await runRuleGrader(grader, task, context);
      default:
        return {
          graderId: grader.id,
          status: 'error',
          score: 0,
          failureReasons: [`Unknown grader type: ${grader.type}`],
        };
    }
  } catch (err: any) {
    return {
      graderId: grader.id,
      status: 'error',
      score: 0,
      failureReasons: [`Grader execution threw error: ${err.message}`],
    };
  }
}
