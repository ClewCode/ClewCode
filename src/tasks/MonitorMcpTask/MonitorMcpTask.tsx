// Monitor MCP task — a background task that watches MCP server connection
// state and reports disconnects/health issues to the running agent. Gated
// behind the MONITOR_TOOL build-time feature flag; the module only loads when
// that flag is on, so everything here is a no-op stub otherwise.

import type { AppState } from '../../state/AppState.js';
import type { SetAppState, Task, TaskStateBase } from '../../Task.js';
import { createTaskStateBase, generateTaskId } from '../../Task.js';
import type { AgentId } from '../../types/ids.js';

export type MonitorMcpPhase = 'watching' | 'alerting';

export type MonitorMcpTaskState = TaskStateBase & {
  type: 'monitor_mcp';
  phase: MonitorMcpPhase;
  /** Server names currently flagged as unhealthy/disconnected. */
  alerts: string[];
  agentId?: AgentId;
  abortController?: AbortController;
};

export function isMonitorMcpTask(task: unknown): task is MonitorMcpTaskState {
  return typeof task === 'object' && task !== null && 'type' in task && task.type === 'monitor_mcp';
}

export function registerMonitorMcpTask(
  setAppState: SetAppState,
  opts: {
    alerts?: string[];
    abortController: AbortController;
  },
): string {
  const id = generateTaskId('monitor_mcp');
  const task: MonitorMcpTaskState = {
    ...createTaskStateBase(id, 'monitor_mcp', 'monitoring MCP servers'),
    type: 'monitor_mcp',
    status: 'running',
    phase: 'watching',
    alerts: opts.alerts ?? [],
    abortController: opts.abortController,
  };
  setAppState(prev => ({ ...prev, tasks: { ...(prev.tasks ?? {}), [id]: task } }));
  return id;
}

export async function killMonitorMcp(taskId: string, setAppState: SetAppState): Promise<void> {
  setAppState(prev => {
    const tasks = { ...(prev.tasks ?? {}) };
    const task = tasks[taskId];
    if (task && isMonitorMcpTask(task)) {
      task.abortController?.abort();
      tasks[taskId] = { ...task, status: 'killed', endTime: Date.now() };
    }
    return { ...prev, tasks };
  });
}

/** Kill all monitor tasks spawned by a given agent (runAgent cleanup path). */
export function killMonitorMcpTasksForAgent(
  agentId: AgentId,
  getAppState: () => AppState,
  setAppState: SetAppState,
): void {
  const tasks = getAppState().tasks ?? {};
  for (const [taskId, task] of Object.entries(tasks)) {
    if (isMonitorMcpTask(task) && task.agentId === agentId && task.status === 'running') {
      void killMonitorMcp(taskId, setAppState);
    }
  }
}

export const MonitorMcpTask: Task = {
  name: 'Monitor MCP',
  type: 'monitor_mcp',
  kill: killMonitorMcp,
};
