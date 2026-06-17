/**
 * /task command implementation.
 */

import {
  addTask,
  getTask,
  listTasks,
  loadQueue,
  markTaskCancelled,
  markTaskCompleted,
  markTaskFailed,
  readTaskLog,
  removeTask,
  requeueDeadLetter,
  retryTask,
  type TaskPriority,
} from '../../services/autonomous/taskQueue.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';

function parseArgs(args: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < args.length; i++) {
    const char = args[i]!;
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ' ' && !inQuotes) {
      if (current.trim().length > 0) result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) result.push(current.trim());
  return result;
}

function getFlagValue(tokens: string[], flag: string): string | undefined {
  const idx = tokens.indexOf(flag);
  if (idx >= 0 && idx + 1 < tokens.length) return tokens[idx + 1];
  return undefined;
}

function _hasFlag(tokens: string[], flag: string): boolean {
  return tokens.includes(flag);
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<ReactNode | null> {
  await loadQueue();
  const tokens = parseArgs(args || '');
  const subcommand = tokens[0]?.toLowerCase();

  if (!subcommand) {
    await loadQueue();
    const tasks = listTasks({ limit: 20 });
    if (tasks.length === 0) {
      onDone('No tasks found. Use `/task add <title>` to create one.', { display: 'system' });
      return null;
    }

    const lines: string[] = [`=== Task Queue (${tasks.length} tasks) ===`];
    for (const t of tasks) {
      const age = Math.round((Date.now() - t.createdAt) / 60000);
      lines.push(`[${t.status}] ${t.id} — ${t.title} (${t.priority}, ${age}m ago)`);
    }
    lines.push('');
    lines.push('Use `/task add <title>` to create a task.');
    onDone(lines.join('\n'), { display: 'system' });
    return null;
  }

  switch (subcommand) {
    case 'add': {
      // Everything after subcommand, before flags
      const title = tokens
        .slice(1)
        .filter(t => !t.startsWith('-'))
        .join(' ');
      const description = getFlagValue(tokens, '-d') ?? getFlagValue(tokens, '--description') ?? '';
      const priority = (getFlagValue(tokens, '-p') ?? getFlagValue(tokens, '--priority') ?? 'normal') as TaskPriority;

      if (!title) {
        onDone('Usage: /task add <title> [-d description] [-p priority] [--tag tag]', { display: 'system' });
        return null;
      }

      const validPriorities: TaskPriority[] = ['low', 'normal', 'high', 'critical'];
      const resolvedPriority = validPriorities.includes(priority) ? priority : 'normal';

      const tags: string[] = [];
      let tagIdx = tokens.indexOf('--tag');
      while (tagIdx >= 0 && tagIdx + 1 < tokens.length) {
        tags.push(tokens[tagIdx + 1]);
        tagIdx = tokens.indexOf('--tag', tagIdx + 1);
      }

      const id = await addTask({
        title,
        description,
        priority: resolvedPriority,
        tags,
      });

      onDone(`Task added: ${id}\nTitle: ${title}\nPriority: ${resolvedPriority}`, { display: 'system' });
      break;
    }

    case 'list': {
      const statusFilter = getFlagValue(tokens, '-s') ?? getFlagValue(tokens, '--status');
      const limitStr = getFlagValue(tokens, '-l') ?? getFlagValue(tokens, '--limit');
      const limit = limitStr ? parseInt(limitStr, 10) : undefined;

      const tasks = listTasks({
        ...(statusFilter ? { status: statusFilter as any } : {}),
        ...(limit ? { limit } : {}),
      });

      if (tasks.length === 0) {
        onDone('No tasks found.', { display: 'system' });
        return null;
      }

      const lines: string[] = [`=== Task Queue (${tasks.length} tasks) ===`];
      for (const t of tasks) {
        const age = Math.round((Date.now() - t.createdAt) / 60000);
        lines.push(`[${t.status}] ${t.id} — ${t.title} (${t.priority}, ${age}m ago)`);
      }
      onDone(lines.join('\n'), { display: 'system' });
      break;
    }

    case 'show': {
      const id = tokens[1];
      if (!id) {
        onDone('Usage: /task show <id>', { display: 'system' });
        return null;
      }
      const task = getTask(id);
      if (!task) {
        onDone(`Task not found: ${id}`, { display: 'system' });
        return null;
      }
      const lines: string[] = [
        `=== Task: ${task.id} ===`,
        `Title: ${task.title}`,
        `Description: ${task.description || '(none)'}`,
        `Priority: ${task.priority}`,
        `Status: ${task.status}`,
        `Created: ${new Date(task.createdAt).toISOString()}`,
        `Tags: ${task.tags.join(', ') || '(none)'}`,
        `Retries: ${task.retryCount}/${task.maxRetries}`,
      ];
      if (task.startedAt) lines.push(`Started: ${new Date(task.startedAt).toISOString()}`);
      if (task.completedAt) lines.push(`Completed: ${new Date(task.completedAt).toISOString()}`);
      if (task.result) lines.push(`Result: ${task.result}`);
      if (task.error) lines.push(`Error: ${task.error}`);
      if (task.lastError) lines.push(`Last error: ${task.lastError}`);
      if (task.agentId) lines.push(`Agent: ${task.agentId}`);
      if (task.projectRoot) lines.push(`Project: ${task.projectRoot}`);
      if (task.deadLetterReason) lines.push(`Dead-letter reason: ${task.deadLetterReason}`);
      if (task.retryAfter) lines.push(`Retry after: ${new Date(task.retryAfter).toISOString()}`);
      if (task.leaseOwner) lines.push(`Leased by: ${task.leaseOwner}`);
      onDone(lines.join('\n'), { display: 'system' });
      break;
    }

    case 'done': {
      const id = tokens[1];
      if (!id) {
        onDone('Usage: /task done <id>', { display: 'system' });
        return null;
      }
      const ok = await markTaskCompleted(id);
      onDone(ok ? `Task ${id} marked completed.` : `Task not found: ${id}`, { display: 'system' });
      break;
    }

    case 'cancel': {
      const id = tokens[1];
      if (!id) {
        onDone('Usage: /task cancel <id>', { display: 'system' });
        return null;
      }
      const ok = await markTaskCancelled(id);
      onDone(ok ? `Task ${id} cancelled.` : `Task not found: ${id}`, { display: 'system' });
      break;
    }

    case 'fail': {
      const id = tokens[1];
      if (!id) {
        onDone('Usage: /task fail <id>', { display: 'system' });
        return null;
      }
      const ok = await markTaskFailed(id, 'Manually marked failed');
      onDone(ok ? `Task ${id} marked failed.` : `Task not found: ${id}`, { display: 'system' });
      break;
    }

    case 'retry': {
      const id = tokens[1];
      if (!id) {
        onDone('Usage: /task retry <id>', { display: 'system' });
        return null;
      }
      const result = await retryTask(id);
      if (result === 'pending') {
        onDone(`Task ${id} queued for retry with backoff.`, { display: 'system' });
      } else if (result === 'dead_letter') {
        onDone(`Task ${id} moved to dead-letter (max retries exceeded). Use /task requeue ${id} to retry manually.`, {
          display: 'system',
        });
      } else {
        onDone(`Cannot retry ${id} (not failed or not found)`, { display: 'system' });
      }
      break;
    }

    case 'requeue': {
      const id = tokens[1];
      if (!id) {
        onDone('Usage: /task requeue <id>', { display: 'system' });
        return null;
      }
      const ok = await requeueDeadLetter(id);
      onDone(ok ? `Task ${id} requeued from dead-letter.` : `Cannot requeue ${id} (not dead_letter or not found)`, {
        display: 'system',
      });
      break;
    }

    case 'remove':
    case 'rm': {
      const id = tokens[1];
      if (!id) {
        onDone('Usage: /task remove <id>', { display: 'system' });
        return null;
      }
      const ok = await removeTask(id);
      onDone(ok ? `Task ${id} removed.` : `Task not found: ${id}`, { display: 'system' });
      break;
    }

    case 'log': {
      const id = tokens[1];
      if (!id) {
        onDone('Usage: /task log <id>', { display: 'system' });
        return null;
      }
      const taskLog = await readTaskLog(id);
      if (!taskLog) {
        onDone(`No log output found for task ${id}.`, { display: 'system' });
      } else {
        onDone(taskLog, { display: 'system' });
      }
      break;
    }

    default: {
      onDone(
        [
          'Usage:',
          '  /task add <title> [-d description] [-p priority] [--tag tag]',
          '  /task list [-s status] [-l limit]',
          '  /task show <id>',
          '  /task done <id>',
          '  /task cancel <id>',
          '  /task fail <id>',
          '  /task retry <id>',
          '  /task requeue <id>     Re-queue a dead-letter task',
          '  /task remove <id>',
          '  /task log <id>         Show task execution log',
          '',
          'Priorities: low, normal, high, critical',
          'Statuses: pending, in_progress, completed, failed, cancelled, dead_letter',
        ].join('\n'),
        { display: 'system' },
      );
      break;
    }
  }

  return null;
}
