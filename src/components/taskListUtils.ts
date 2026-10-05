import type { Task } from '../utils/tasks.js';

export const RECENT_COMPLETED_TTL_MS = 30_000;

export function compareTaskIds(a: Task, b: Task): number {
  const aNum = parseInt(a.id, 10);
  const bNum = parseInt(b.id, 10);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
  return a.id.localeCompare(b.id);
}

export function prioritizeTasks(
  tasks: Task[],
  completionTimestamps: ReadonlyMap<string, number>,
  now: number,
  maxDisplay: number,
): { visibleTasks: Task[]; hiddenTasks: Task[] } {
  if (tasks.length <= maxDisplay) return { visibleTasks: [...tasks].sort(compareTaskIds), hiddenTasks: [] };

  const unresolvedTaskIds = new Set(tasks.filter(task => task.status !== 'completed').map(task => task.id));
  const recentCompleted = tasks
    .filter(
      task => task.status === 'completed' && (completionTimestamps.get(task.id) ?? 0) + RECENT_COMPLETED_TTL_MS > now,
    )
    .sort(compareTaskIds);
  const olderCompleted = tasks
    .filter(task => task.status === 'completed' && !recentCompleted.includes(task))
    .sort(compareTaskIds);
  const inProgress = tasks.filter(task => task.status === 'in_progress').sort(compareTaskIds);
  const pending = tasks
    .filter(task => task.status === 'pending')
    .sort((a, b) => {
      const aBlocked = a.blockedBy.some(id => unresolvedTaskIds.has(id));
      const bBlocked = b.blockedBy.some(id => unresolvedTaskIds.has(id));
      return aBlocked === bBlocked ? compareTaskIds(a, b) : aBlocked ? 1 : -1;
    });

  const prioritized = [...recentCompleted, ...inProgress, ...pending, ...olderCompleted];
  return { visibleTasks: prioritized.slice(0, maxDisplay), hiddenTasks: prioritized.slice(maxDisplay) };
}
