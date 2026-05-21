import { exec } from 'child_process';
import { promisify } from 'util';
import type { EvalTask, GraderConfig, GraderResult } from '../types.js';
import type { GraderContext } from './index.js';

const execPromise = promisify(exec);

export async function runCommandGrader(
  grader: GraderConfig,
  task: EvalTask,
  context: GraderContext,
): Promise<GraderResult> {
  const commands = grader.commands || [];
  const expectedExitCode = grader.passWhen?.exitCode ?? 0;
  const failureReasons: string[] = [];

  if (commands.length === 0) {
    return {
      graderId: grader.id,
      status: 'pass',
      score: 1.0,
      failureReasons: [],
    };
  }

  for (const cmd of commands) {
    try {
      await execPromise(cmd, { cwd: context.workspaceDir });
    } catch (err: any) {
      const exitCode = err.code ?? 1;
      if (exitCode !== expectedExitCode) {
        failureReasons.push(
          `Command "${cmd}" exited with code ${exitCode} (expected ${expectedExitCode}). Output: ${err.stdout || ''} ${err.stderr || ''}`,
        );
      }
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
