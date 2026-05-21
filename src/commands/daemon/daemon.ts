/**
 * /daemon command implementation.
 */

import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import {
  getAutonomousStatus,
  startAutonomousAgent,
  stopAutonomousAgent,
} from '../../services/autonomous/supervisorIntegration.js';

function parseArgs(args: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < args.length; i++) {
    const char = args[i]!;
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

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const tokens = parseArgs(args || '');
  const subcommand = tokens[0]?.toLowerCase();

  switch (subcommand) {
    case 'start': {
      const ok = await startAutonomousAgent();
      if (ok) {
        onDone('24/7 autonomous agent started. Use `/daemon status` to check.', { display: 'system' });
      } else {
        onDone('Failed to start autonomous agent.', { display: 'system' });
      }
      break;
    }

    case 'stop': {
      const ok = await stopAutonomousAgent();
      if (ok) {
        onDone('Autonomous agent stopped.', { display: 'system' });
      } else {
        onDone('Autonomous agent was not running.', { display: 'system' });
      }
      break;
    }

    case 'restart': {
      await stopAutonomousAgent();
      await new Promise(r => setTimeout(r, 1000));
      const ok = await startAutonomousAgent();
      if (ok) {
        onDone('Autonomous agent restarted.', { display: 'system' });
      } else {
        onDone('Failed to restart autonomous agent.', { display: 'system' });
      }
      break;
    }

    case 'status':
    default: {
      const status = await getAutonomousStatus();
      const lines: string[] = ['=== 24/7 Autonomous Daemon Status ==='];

      lines.push(`Daemon: ${status.enabled ? 'Enabled' : 'Disabled'}`);
      lines.push(`Auto-start: ${status.autoStart ? 'Yes' : 'No'}`);
      lines.push(`Process: ${status.running ? 'Running' : 'Not running'}`);

      if (status.agent) {
        const a = status.agent;
        const uptime = a.running ? Math.round((Date.now() - a.startedAt) / 1000) : 0;
        lines.push(`Uptime: ${uptime}s`);
        lines.push(`Tasks processed: ${a.tasksProcessed}`);
        lines.push(`Tasks failed: ${a.tasksFailed}`);
        lines.push(`Dead-lettered: ${a.tasksDeadLettered}`);
        if (a.lastErrorMessage) {
          lines.push(`Last error: ${a.lastErrorMessage}`);
        }
        if (a.currentTaskTitle) {
          lines.push(`Current task: ${a.currentTaskTitle}`);
        }
      }

      if (status.tasks) {
        const t = status.tasks;
        lines.push('');
        lines.push('=== Task Queue ===');
        lines.push(`Total: ${t.total}`);
        lines.push(`Pending: ${t.pending}`);
        lines.push(`In Progress: ${t.inProgress}`);
        lines.push(`Completed: ${t.completed}`);
        lines.push(`Failed: ${t.failed}`);
        lines.push(`Dead-letter: ${t.deadLetter}`);
      }

      lines.push('');
      lines.push('Commands:');
      lines.push('  /daemon start     Start autonomous agent');
      lines.push('  /daemon stop      Stop autonomous agent');
      lines.push('  /daemon status    Show status');
      lines.push('  /daemon restart   Restart agent');
      lines.push('  /task add ...     Add a task to the queue');
      lines.push('  /task list        List tasks');

      onDone(lines.join('\n'), { display: 'system' });
      break;
    }
  }

  return null;
}
