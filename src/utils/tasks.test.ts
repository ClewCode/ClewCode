import { describe, expect, it } from 'bun:test';
import {
  clearLeaderTeamName,
  onTasksUpdated,
  setLeaderTeamName,
  TASK_STATUSES,
  TaskSchema,
  TaskStatusSchema,
} from './tasks.js';

describe('Task statuses and schema', () => {
  it('defines valid task statuses', () => {
    expect(TASK_STATUSES).toEqual(['pending', 'in_progress', 'completed']);
  });

  it('validates valid status values via schema', () => {
    const schema = TaskStatusSchema();
    expect(schema.safeParse('pending').success).toBe(true);
    expect(schema.safeParse('in_progress').success).toBe(true);
    expect(schema.safeParse('completed').success).toBe(true);
    expect(schema.safeParse('invalid_status').success).toBe(false);
  });

  it('validates a complete task object', () => {
    const task = {
      id: 'task_001',
      subject: 'Refactor basic tools',
      description: 'Add tests and hardening to FileReadTool and FileEditTool',
      status: 'in_progress',
      owner: 'agent-1',
      blocks: [],
      blockedBy: [],
    };
    const parsed = TaskSchema().safeParse(task);
    expect(parsed.success).toBe(true);
  });
});

describe('Leader team name and task updates notifications', () => {
  it('emits onTasksUpdated when leader team name changes', () => {
    let updateCount = 0;
    const unsubscribe = onTasksUpdated(() => {
      updateCount++;
    });

    setLeaderTeamName('team-alpha');
    expect(updateCount).toBe(1);

    // Same name should not emit redundant signal
    setLeaderTeamName('team-alpha');
    expect(updateCount).toBe(1);

    clearLeaderTeamName();
    expect(updateCount).toBe(2);

    unsubscribe();
  });
});
