import type { EvalTask } from './types.js';

export async function runTaskWithAgent(
  task: EvalTask,
): Promise<{ output: string; changedFiles: string[]; shellCommands: string[] }> {
  return {
    output: task.input,
    changedFiles: [],
    shellCommands: [],
  };
}
