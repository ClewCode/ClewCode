import { describe, expect, test } from 'bun:test';
import type { Task } from '../utils/tasks.js';
import { prioritizeTasks } from './taskListUtils.js';

const task = (id: string, status: Task['status'], blockedBy: string[] = []): Task =>
  ({ id, subject: id, status, blockedBy }) as Task;

describe('prioritizeTasks', () => {
  test('keeps active and unblocked pending work ahead of older completed work', () => {
    const tasks = [task('1', 'completed'), task('2', 'pending', ['3']), task('3', 'in_progress'), task('4', 'pending')];
    const result = prioritizeTasks(tasks, new Map(), Date.now(), 3);
    expect(result.visibleTasks.map(t => t.id)).toEqual(['3', '4', '2']);
    expect(result.hiddenTasks.map(t => t.id)).toEqual(['1']);
  });
});
