/**
 * /daemon command implementation.
 *
 * - No args: hands off to the model for a conversational 24/7 daemon setup.
 *   The model asks questions one by one via chat, then runs `/daemon start`.
 * - start|stop|restart|status: direct control of the autonomous daemon.
 */

import { createElement, type ReactNode } from 'react';
import {
  getAutonomousStatus,
  startAutonomousAgent,
  stopAutonomousAgent,
} from '../../services/autonomous/supervisorIntegration.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { formatDaemonStatus } from './daemonStatus.js';

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

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<ReactNode | null> {
  const tokens = parseArgs(args || '');
  const subcommand = tokens[0]?.toLowerCase();

  if (!subcommand) {
    onDone(
      [
        'Configure and start the 24/7 autonomous daemon.',
        '',
        'Ask the user any questions you need (auto-start preference, project scope, schedule, etc.).',
        'When you have everything, run `/daemon start` to launch it.',
      ].join('\n'),
      { display: 'user', shouldQuery: true },
    );
    return null;
  }

  switch (subcommand) {
    case 'start': {
      const ok = await startAutonomousAgent();
      onDone(ok ? '24/7 autonomous daemon started.' : 'Failed to start autonomous daemon.', { display: 'system' });
      break;
    }

    case 'stop': {
      const ok = await stopAutonomousAgent();
      onDone(ok ? 'Autonomous daemon stopped.' : 'Autonomous daemon was not running.', { display: 'system' });
      break;
    }

    case 'restart': {
      await stopAutonomousAgent();
      await new Promise(r => setTimeout(r, 1000));
      const ok = await startAutonomousAgent();
      onDone(ok ? 'Autonomous daemon restarted.' : 'Failed to restart autonomous daemon.', { display: 'system' });
      break;
    }

    case 'status':
    default: {
      const status = await getAutonomousStatus();
      onDone(formatDaemonStatus(status), { display: 'system' });
      break;
    }
  }

  return null;
}
