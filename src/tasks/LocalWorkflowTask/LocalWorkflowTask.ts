// Local workflow task — runs a multi-agent workflow script as a background
// task. Gated behind the WORKFLOW_SCRIPTS build-time feature flag; the module
// only loads when that flag is on.

import type { AppState } from '../../state/AppState.js';
import type { SetAppState, Task, TaskStateBase } from '../../Task.js';
import { createTaskStateBase, generateTaskId } from '../../Task.js';
import type { AgentId } from '../../types/ids.js';

export type LocalWorkflowPhase = 'starting' | 'running' | 'done';

export type LocalWorkflowTaskState = TaskStateBase & {
  type: 'local_workflow';
  phase: LocalWorkflowPhase;
  /** Agent ids participating in this workflow, in spawn order. */
  agentIds: string[];
  /** Optional human-readable summary shown in the task list label. */
  summary?: string;
  abortController?: AbortController;
};

export function isLocalWorkflowTask(task: unknown): task is LocalWorkflowTaskState {
  return typeof task === 'object' && task !== null && 'type' in task && task.type === 'local_workflow';
}

export function registerLocalWorkflowTask(
  setAppState: SetAppState,
  opts: {
    agentIds?: string[];
    abortController: AbortController;
  },
): string {
  const id = generateTaskId('local_workflow');
  const task: LocalWorkflowTaskState = {
    ...createTaskStateBase(id, 'local_workflow', 'running workflow'),
    type: 'local_workflow',
    status: 'running',
    phase: 'running',
    agentIds: opts.agentIds ?? [],
    abortController: opts.abortController,
  };
  setAppState(prev => ({ ...prev, tasks: { ...(prev.tasks ?? {}), [id]: task } }));
  return id;
}

export async function killWorkflowTask(taskId: string, setAppState: SetAppState): Promise<void> {
  setAppState(prev => {
    const tasks = { ...(prev.tasks ?? {}) };
    const task = tasks[taskId];
    if (task && isLocalWorkflowTask(task)) {
      task.abortController?.abort();
      tasks[taskId] = { ...task, status: 'killed', endTime: Date.now() };
    }
    return { ...prev, tasks };
  });
}

/** Skip a single agent inside a running workflow. */
export function skipWorkflowAgent(taskId: string, agentId: AgentId, setAppState: SetAppState): void {
  setAppState(prev => {
    const tasks = { ...(prev.tasks ?? {}) };
    const task = tasks[taskId];
    if (task && isLocalWorkflowTask(task)) {
      tasks[taskId] = { ...task, agentIds: task.agentIds.filter(id => id !== agentId) };
    }
    return { ...prev, tasks };
  });
}

/** Retry a single agent inside a running workflow. */
export function retryWorkflowAgent(taskId: string, agentId: AgentId, setAppState: SetAppState): void {
  setAppState(prev => {
    const tasks = { ...(prev.tasks ?? {}) };
    const task = tasks[taskId];
    if (task && isLocalWorkflowTask(task)) {
      tasks[taskId] = { ...task, agentIds: [...task.agentIds, agentId] };
    }
    return { ...prev, tasks };
  });
}

export const LocalWorkflowTask: Task = {
  name: 'Local Workflow',
  type: 'local_workflow',
  kill: killWorkflowTask,
};
