import { useEffect, useRef, useState } from 'react';
import type { Task } from '../utils/tasks.js';
import { RECENT_COMPLETED_TTL_MS } from './taskListUtils.js';

export function useTaskTiming(tasks: Task[]) {
  const [, forceUpdate] = useState(0);
  const completionTimestampsRef = useRef(new Map<string, number>());
  const previousCompletedIdsRef = useRef<Set<string> | null>(null);
  const startTimestampsRef = useRef(new Map<string, number>());
  const previousInProgressIdsRef = useRef<Set<string> | null>(null);
  const now = Date.now();

  if (previousCompletedIdsRef.current === null) {
    previousCompletedIdsRef.current = new Set(tasks.filter(task => task.status === 'completed').map(task => task.id));
  }
  const completedIds = new Set(tasks.filter(task => task.status === 'completed').map(task => task.id));
  for (const id of completedIds) {
    if (!previousCompletedIdsRef.current.has(id)) completionTimestampsRef.current.set(id, now);
  }
  for (const id of completionTimestampsRef.current.keys()) {
    if (!completedIds.has(id)) completionTimestampsRef.current.delete(id);
  }
  previousCompletedIdsRef.current = completedIds;

  if (previousInProgressIdsRef.current === null) {
    previousInProgressIdsRef.current = new Set(
      tasks.filter(task => task.status === 'in_progress').map(task => task.id),
    );
  }
  const inProgressIds = new Set(tasks.filter(task => task.status === 'in_progress').map(task => task.id));
  for (const id of inProgressIds) {
    if (!previousInProgressIdsRef.current.has(id)) startTimestampsRef.current.set(id, now);
  }
  for (const id of startTimestampsRef.current.keys()) {
    if (!inProgressIds.has(id)) startTimestampsRef.current.delete(id);
  }
  previousInProgressIdsRef.current = inProgressIds;

  useEffect(() => {
    if (completionTimestampsRef.current.size === 0) return;
    const currentNow = Date.now();
    const earliestExpiry = Math.min(
      ...[...completionTimestampsRef.current.values()]
        .map(timestamp => timestamp + RECENT_COMPLETED_TTL_MS)
        .filter(expiry => expiry > currentNow),
    );
    if (!Number.isFinite(earliestExpiry)) return;
    const timer = setTimeout(() => forceUpdate(value => value + 1), earliestExpiry - currentNow);
    return () => clearTimeout(timer);
  }, [tasks]);

  return { now, completionTimestampsRef, startTimestampsRef };
}
