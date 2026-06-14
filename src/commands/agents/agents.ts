import * as React from 'react';
import { AgentViewDashboard } from '../../components/agents/AgentViewDashboard.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode | null> {
  const trimmedArgs = args.trim();
  const cwdMatch = trimmedArgs.match(/--cwd\s+(\S+)/);
  const cwd = cwdMatch ? cwdMatch[1] : undefined;

  return React.createElement(AgentViewDashboard, {
    cwd,
    onBack: () => onDone('Agent view dismissed', { display: 'system' }),
  });
}
