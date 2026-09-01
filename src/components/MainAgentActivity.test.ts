import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { LocalAgentTaskState } from '../tasks/LocalAgentTask/LocalAgentTask.js';
import { buildMainAgentActivityModel } from './MainAgentActivity.js';

function task(
  id: string,
  status: LocalAgentTaskState['status'],
  startTime: number,
  toolName?: string,
): LocalAgentTaskState {
  return {
    id,
    type: 'local_agent',
    status,
    description: id,
    agentId: id,
    agentType: 'general-purpose',
    prompt: id,
    startTime,
    pendingMessages: [],
    progress: toolName ? { lastActivity: { toolName, activityDescription: id } } : undefined,
  } as unknown as LocalAgentTaskState;
}

describe('buildMainAgentActivityModel', () => {
  test('orders needs-input, working, then completed local agents', () => {
    const model = buildMainAgentActivityModel([
      task('old completed', 'completed', 1),
      task('working', 'running', 3),
      task('needs input', 'running', 2, 'AskUserQuestionTool'),
      task('new completed', 'completed', 4),
    ]);

    expect(model.counts).toEqual({ running: 1, idle: 1, inactive: 2 });
    expect(model.rows.map(row => row.title)).toEqual(['needs input', 'working', 'new completed', 'old completed']);
  });

  test('an empty current-session task list produces an empty roster', () => {
    expect(buildMainAgentActivityModel([])).toEqual({
      counts: { running: 0, idle: 0, inactive: 0 },
      rows: [],
    });
  });

  test('does not couple the main page to global or archived session loaders', () => {
    const source = readFileSync(new URL('./MainAgentActivity.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('loadSavedCatalogSessions');
    expect(source).not.toContain('loadSupervisorSessions');
    expect(source).not.toContain('/sessions manage all');
  });

  test('renders below the input footer instead of at the top of the transcript', () => {
    const messagesSource = readFileSync(new URL('./Messages.tsx', import.meta.url), 'utf8');
    const replSource = readFileSync(new URL('../screens/REPL.tsx', import.meta.url), 'utf8');
    const statusLineIndex = replSource.indexOf('<StatusLine');
    const activityIndex = replSource.indexOf('<MainAgentActivity />');

    expect(messagesSource).not.toContain('<MainAgentActivity />');
    expect(statusLineIndex).toBeGreaterThan(-1);
    expect(activityIndex).toBeGreaterThan(statusLineIndex);
  });
});
