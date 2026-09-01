import { describe, expect, test } from 'bun:test';
import type { Task } from '../utils/tasks.js';
import { buildTaskDisplayGroups, toRomanNumeral } from './TaskListV2.js';

function task(id: string, subject: string, metadata?: Record<string, unknown>): Task {
  return {
    id,
    subject,
    description: subject,
    status: 'pending',
    blocks: [],
    blockedBy: [],
    metadata,
  };
}

describe('TaskListV2 display groups', () => {
  test('groups and orders tasks from metadata while sorting children by task id', () => {
    const groups = buildTaskDisplayGroups([
      task('4', 'Run smoke test', { group: 'Verification', groupOrder: 2 }),
      task('2', 'Add renderer', { group: 'Implementation', groupOrder: 1 }),
      task('1', 'Define styles', { group: 'Implementation', groupOrder: 1 }),
    ]);

    expect(groups.map(group => group.title)).toEqual(['Implementation', 'Verification']);
    expect(groups[0]?.tasks.map(item => item.id)).toEqual(['1', '2']);
  });

  test('keeps existing ungrouped tasks in a compatible default section', () => {
    const groups = buildTaskDisplayGroups([task('1', 'Inspect code'), task('2', 'Make change')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe('Execution');
  });

  test('formats section indices as Roman numerals', () => {
    expect([1, 4, 9, 12].map(toRomanNumeral)).toEqual(['I', 'IV', 'IX', 'XII']);
  });
});
