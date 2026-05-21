import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Set env BEFORE importing the module
const testDir = join(tmpdir(), 'claude-autonomous-test');
const originalHome = process.env['CLAUDE_CONFIG_HOME'];
const testHome = join(testDir, 'config');
process.env['CLAUDE_CONFIG_HOME'] = testHome;

import {
  _resetQueueForTest,
  addTask,
  buildWorkerPrompt,
  expireLeases,
  getNextTask,
  getQueueStats,
  getTask,
  leaseTask,
  listTasks,
  loadQueue,
  markTaskCancelled,
  markTaskCompleted,
  markTaskFailed,
  releaseLease,
  removeTask,
  requeueDeadLetter,
  retryTask,
} from './taskQueue.js';

function cleanTestDir(): void {
  try {
    const p = join(testHome, 'daemon', 'tasks.json');
    if (existsSync(p)) unlinkSync(p);
  } catch {
    // ignore
  }
}

beforeAll(async () => {
  cleanTestDir();
  _resetQueueForTest();
  await loadQueue();
});

afterAll(() => {
  if (originalHome) {
    process.env['CLAUDE_CONFIG_HOME'] = originalHome;
  } else {
    delete process.env['CLAUDE_CONFIG_HOME'];
  }
  cleanTestDir();
});

// ─── Basic CRUD ────────────────────────────────────────────────

test('addTask creates a task and returns an id', async () => {
  const id = await addTask({ title: 'Test task', description: 'A test', priority: 'high', tags: ['test'] });
  expect(id).toBeDefined();
  expect(id.length).toBeGreaterThan(0);
});

test('getTask retrieves the task by id', async () => {
  const id = await addTask({ title: 'Get me' });
  const task = getTask(id);
  expect(task).toBeDefined();
  expect(task!.title).toBe('Get me');
  expect(task!.status).toBe('pending');
});

test('listTasks returns tasks ordered by priority', async () => {
  for (const t of listTasks({ status: 'pending' })) await markTaskCompleted(t.id);
  const lowId = await addTask({ title: 'Low', priority: 'low' });
  const criticalId = await addTask({ title: 'Critical', priority: 'critical' });
  const tasks = listTasks({ status: 'pending' });
  const ci = tasks.findIndex(t => t.id === criticalId);
  const li = tasks.findIndex(t => t.id === lowId);
  expect(ci).toBeLessThan(li);
});

test('listTasks filters by status', async () => {
  const id = await addTask({ title: 'Filter me' });
  await markTaskCompleted(id);
  expect(listTasks({ status: 'pending' }).find(t => t.id === id)).toBeUndefined();
  expect(listTasks({ status: 'completed' }).find(t => t.id === id)).toBeDefined();
});

test('markTaskCompleted updates status and result', async () => {
  const id = await addTask({ title: 'Complete me' });
  await markTaskCompleted(id, 'Done!');
  const task = getTask(id);
  expect(task!.status).toBe('completed');
  expect(task!.result).toBe('Done!');
  expect(task!.completedAt).toBeDefined();
});

test('markTaskFailed sets failed', async () => {
  const id = await addTask({ title: 'Fail me' });
  await markTaskFailed(id, 'Something broke');
  const task = getTask(id);
  expect(task!.status).toBe('failed');
  expect(task!.error).toBe('Something broke');
  expect(task!.lastError).toBe('Something broke');
});

test('markTaskCancelled sets cancelled', async () => {
  const id = await addTask({ title: 'Cancel me' });
  await markTaskCancelled(id);
  expect(getTask(id)!.status).toBe('cancelled');
});

test('removeTask deletes the task', async () => {
  const id = await addTask({ title: 'Remove me' });
  expect(await removeTask(id)).toBe(true);
  expect(getTask(id)).toBeUndefined();
});

// ─── Priority & Scheduling ─────────────────────────────────────

test('getNextTask returns highest priority ready task', async () => {
  for (const t of [...listTasks({ status: 'pending' }), ...listTasks({ status: 'in_progress' })]) {
    await markTaskCompleted(t.id);
  }
  await addTask({ title: 'Low', priority: 'low' });
  await addTask({ title: 'Normal', priority: 'normal' });
  const highId = await addTask({ title: 'High', priority: 'high' });
  expect(getNextTask()!.id).toBe(highId);
});

test('getNextTask respects scheduledAt', async () => {
  // Clear other pending tasks that might interfere
  for (const t of [...listTasks({ status: 'pending' }), ...listTasks({ status: 'in_progress' })]) {
    await markTaskCompleted(t.id);
  }
  const now = Date.now();
  await addTask({ title: 'Future', priority: 'high', scheduledAt: now + 3600_000 });
  await addTask({ title: 'Now', priority: 'low' });
  expect(getNextTask()!.title).toBe('Now');
});

test('getNextTask respects dependency chain', async () => {
  const depId = await addTask({ title: 'Dependency', priority: 'critical' });
  const childId = await addTask({ title: 'Child', priority: 'critical', dependsOn: [depId] });
  expect(getNextTask()!.id).toBe(depId);
  expect(getNextTask()!.id).not.toBe(childId);
  await markTaskCompleted(depId);
  expect(getNextTask()!.id).toBe(childId);
});

// ─── Lease / Lock ──────────────────────────────────────────────

test('leaseTask prevents duplicate claim', async () => {
  const id = await addTask({ title: 'Lease test' });
  expect(await leaseTask(id, 'owner-1')).toBe(true); // first claim
  expect(await leaseTask(id, 'owner-2')).toBe(false); // different owner blocked
  expect(await leaseTask(id, 'owner-1')).toBe(true);  // same owner re-lease ok
  await releaseLease(id, 'owner-1');
});

test('releaseLease returns task to pending', async () => {
  const id = await addTask({ title: 'Release test' });
  await leaseTask(id, 'owner-1');
  expect(getTask(id)!.status).toBe('in_progress');
  await releaseLease(id, 'owner-1');
  expect(getTask(id)!.status).toBe('pending');
  expect(getTask(id)!.leaseOwner).toBeUndefined();
});

test('releaseLease only works for lease owner', async () => {
  const id = await addTask({ title: 'Owner test' });
  await leaseTask(id, 'owner-1');
  expect(await releaseLease(id, 'owner-2')).toBe(false);
  await releaseLease(id, 'owner-1');
});

test('expireLeases recovers tasks from crashed workers', async () => {
  const id = await addTask({ title: 'Crashed worker' });
  await leaseTask(id, 'crashed-worker');

  // Manually expire the lease
  const task = getTask(id)!;
  task.leaseExpiresAt = Date.now() - 1000;

  const count = await expireLeases();
  expect(count).toBe(1);

  const recovered = getTask(id)!;
  expect(recovered.status).toBe('pending');
  expect(recovered.leaseOwner).toBeUndefined();
  expect(recovered.lastError).toContain('Lease expired');
});

test('getNextTask skips actively leased tasks', async () => {
  for (const t of [...listTasks({ status: 'pending' }), ...listTasks({ status: 'in_progress' })]) {
    await markTaskCompleted(t.id);
  }
  const heldId = await addTask({ title: 'Held by other', priority: 'critical' });
  const freeId = await addTask({ title: 'Free', priority: 'normal' });
  await leaseTask(heldId, 'other-daemon', 60_000);
  const next = getNextTask();
  expect(next).toBeDefined();
  expect(next!.id).toBe(freeId);
  await releaseLease(heldId, 'other-daemon');
});

// ─── Retry & Dead-letter ──────────────────────────────────────

test('retryTask resets a failed task to pending with backoff', async () => {
  const id = await addTask({ title: 'Retry me', maxRetries: 3 });
  await markTaskFailed(id);
  const result = await retryTask(id);
  expect(result).toBe('pending');
  const task = getTask(id)!;
  expect(task.status).toBe('pending');
  expect(task.retryCount).toBe(1);
  expect(task.retryAfter).toBeGreaterThan(Date.now());
});

test('retryTask moves to dead-letter when maxRetries exceeded', async () => {
  const id = await addTask({ title: 'Dead letter', maxRetries: 0 });
  await markTaskFailed(id);
  const result = await retryTask(id);
  expect(result).toBe('dead_letter');
  const task = getTask(id)!;
  expect(task.status).toBe('dead_letter');
  expect(task.deadLetterReason).toContain('max');
});

test('requeueDeadLetter returns dead-letter task to pending', async () => {
  const id = await addTask({ title: 'Requeue me', maxRetries: 0 });
  await markTaskFailed(id);
  await retryTask(id);
  expect(await requeueDeadLetter(id)).toBe(true);
  const task = getTask(id)!;
  expect(task.status).toBe('pending');
  expect(task.retryCount).toBe(0);
  expect(task.deadLetterReason).toBeUndefined();
});

test('requeueDeadLetter only works on dead_letter tasks', async () => {
  const id = await addTask({ title: 'Not dead yet' });
  expect(await requeueDeadLetter(id)).toBe(false);
});

// ─── Project Namespace ────────────────────────────────────────

test('addTask stores projectRoot', async () => {
  const id = await addTask({ title: 'Project task', projectRoot: '/projects/my-repo' });
  expect(getTask(id)!.projectRoot).toBe('/projects/my-repo');
});

// ─── Prompt Injection Boundary ────────────────────────────────

test('buildWorkerPrompt wraps task in XML with policy', () => {
  const prompt = buildWorkerPrompt({
    id: 'test-123',
    title: 'Fix auth bug',
    description: 'Update the login handler to validate tokens',
    priority: 'high',
    status: 'pending',
    createdAt: Date.now(),
    tags: ['security', 'auth'],
    dependsOn: [],
    retryCount: 0,
    maxRetries: 3,
  });

  expect(prompt).toContain('<policy>');
  expect(prompt).toContain('</policy>');
  expect(prompt).toContain('<task_data>');
  expect(prompt).toContain('</task_data>');
  expect(prompt).toContain('Fix auth bug');
  expect(prompt).toContain('validate tokens');
  expect(prompt).toContain('CRITICAL SYSTEM POLICY');
  expect(prompt).toContain('security');
});

test('buildWorkerPrompt sanitizes CDATA injection', () => {
  const prompt = buildWorkerPrompt({
    id: 'test-456',
    title: ']]><script>alert(1)</script>',
    description: ']]><escape>test',
    priority: 'normal',
    status: 'pending',
    createdAt: Date.now(),
    tags: [],
    dependsOn: [],
    retryCount: 0,
    maxRetries: 3,
  });

  expect(prompt).not.toContain(']]><script>');
  expect(prompt).toContain(']] >');
});

// ─── Queue Stats ──────────────────────────────────────────────

test('getQueueStats returns all status counts', () => {
  const stats = getQueueStats();
  expect(stats).toHaveProperty('total');
  expect(stats).toHaveProperty('pending');
  expect(stats).toHaveProperty('inProgress');
  expect(stats).toHaveProperty('completed');
  expect(stats).toHaveProperty('failed');
  expect(stats).toHaveProperty('cancelled');
  expect(stats).toHaveProperty('deadLetter');
});

// ─── Edge Cases ───────────────────────────────────────────────

test('getNextTask returns undefined on empty queue', () => {
  _resetQueueForTest();
  expect(getNextTask()).toBeUndefined();
});
