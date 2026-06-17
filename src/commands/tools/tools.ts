import type * as React from 'react';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { formatLastCalled, getAllToolUsage, resetToolUsage } from '../../utils/toolUsageTracker.js';

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext,
  args: string,
): Promise<React.ReactNode> {
  const trimmed = args.trim().toLowerCase();

  if (trimmed === 'reset') {
    resetToolUsage();
    onDone('Tool usage stats reset', { display: 'system' });
    return null;
  }

  const usage = getAllToolUsage();

  if (usage.length === 0) {
    onDone('No tool usage recorded yet', { display: 'system' });
    return null;
  }

  const totalCalls = usage.reduce((s, t) => s + t.callCount, 0);
  const totalInput = usage.reduce((s, t) => s + t.totalInputTokens, 0);
  const totalOutput = usage.reduce((s, t) => s + t.totalOutputTokens, 0);

  const lines = usage.map(t => {
    const avgInput = t.callCount > 0 ? Math.round(t.totalInputTokens / t.callCount) : 0;
    const avgOutput = t.callCount > 0 ? Math.round(t.totalOutputTokens / t.callCount) : 0;
    return `  ${t.name.padEnd(25)} ${String(t.callCount).padStart(4)} calls  ~${String(avgInput).padStart(6)}i / ${String(avgOutput).padStart(6)}o avg  last ${formatLastCalled(t.lastCalledAt)}`;
  });

  const summary = [
    `Tool usage (${totalCalls} total calls, ~${totalInput}i / ${totalOutput}o tokens):`,
    ...lines,
    '',
    'Usage: /tools reset — clear stats',
  ].join('\n');

  onDone(summary, { display: 'system' });
  return null;
}
