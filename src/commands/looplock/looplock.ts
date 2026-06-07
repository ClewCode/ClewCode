import { startAutonomousAgent, getAutonomousStatus } from '../../services/autonomous/supervisorIntegration.js';
import { addTask } from '../../services/autonomous/taskQueue.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import chalk from 'chalk';
import type * as React from 'react';

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const status = await getAutonomousStatus();
  if (!status.running) {
    const ok = await startAutonomousAgent();
    if (!ok) {
      onDone(chalk.red('Failed to enable and start autonomous agent loop.'), { display: 'system' });
      return null;
    }
  }

  const trimmedArgs = args?.trim();
  if (trimmedArgs && trimmedArgs.length > 0) {
    try {
      const taskId = await addTask({
        title: 'User Instruction via /looplock',
        description: trimmedArgs,
        priority: 'high',
        projectRoot: process.cwd(),
        tags: ['user-command'],
      });
      onDone(chalk.green(`Autonomous agent loop started and task successfully enqueued (Task ID: ${taskId})!`), { display: 'system' });
    } catch (err) {
      onDone(chalk.red(`Failed to enqueue task: ${(err as Error).message}`), { display: 'system' });
    }
  } else {
    onDone(chalk.green('24/7 autonomous agent loop successfully enabled and started! Use `/daemon status` to check status.'), { display: 'system' });
  }
  return null;
}
