/**
 * /task command — Manage the autonomous task queue.
 *
 * Subcommands:
 *   /task add <title> -d <description> -p <priority>  Add a new task
 *   /task list [--status <s>] [--limit <n>]            List tasks
 *   /task done <id>                                     Mark task completed
 *   /task cancel <id>                                   Cancel a task
 *   /task fail <id>                                     Mark task failed
 *   /task retry <id>                                    Retry a failed task
 *   /task remove <id>                                   Remove a task
 *   /task show <id>                                     Show task details
 */

import type { Command } from '../../commands.js';

const task: Command = {
  type: 'local-jsx',
  name: 'task',
  description: 'Manage the autonomous task queue (add/list/done/cancel/retry)',
  isEnabled: () => true,
  argumentHint: '<add|list|done|cancel|retry|remove|show> [args]',
  load: () => import('./task.js'),
};

export default task;
