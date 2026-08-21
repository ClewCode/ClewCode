import { describe, expect, test } from 'bun:test';
import type { PermissionMode } from '../permissions/PermissionMode.js';
import { classifyTaskComplexity, inferTaskModeFromPermissionMode, type TaskMode } from './router.js';

// The router has no task-mode UI of its own — it derives the task mode from
// the permission mode the session is already in. That mapping is the contract
// users configure against, so it is pinned here explicitly.
describe('inferTaskModeFromPermissionMode', () => {
  const cases: [PermissionMode | undefined, TaskMode][] = [
    ['plan', 'plan'],
    ['bypassPermissions', 'orchestrator'],
    ['auto', 'orchestrator'],
    ['default', 'code'],
    ['acceptEdits', 'code'],
    ['ask', 'ask'],
    ['dontAsk', 'debug'],
  ];

  for (const [permissionMode, expected] of cases) {
    test(`maps '${permissionMode}' to '${expected}'`, () => {
      expect(inferTaskModeFromPermissionMode(permissionMode)).toBe(expected);
    });
  }

  test("defaults to 'code' when no permission mode is set", () => {
    expect(inferTaskModeFromPermissionMode(undefined)).toBe('code');
  });

  test("falls back to 'code' for an unrecognized mode", () => {
    // Modes can be added to PermissionMode without updating this mapping;
    // an unknown one must degrade to normal coding, never throw.
    expect(inferTaskModeFromPermissionMode('someFutureMode' as PermissionMode)).toBe('code');
  });
});

describe('classifyTaskComplexity', () => {
  test('classifies architectural refactoring as complex with high effort', () => {
    const res = classifyTaskComplexity(
      'Please re-architect and refactor the multi-thread concurrency pipeline to fix a memory leak',
    );
    expect(res.complexity).toBe('complex');
    expect(res.suggestedEffort).toBe('high');
    expect(res.reasons.length).toBeGreaterThan(0);
  });

  test('classifies planning requests as plan mode', () => {
    const res = classifyTaskComplexity('Help me plan the strategy and design doc for migrating to Bun');
    expect(res.complexity).toBe('complex');
    expect(res.suggestedMode).toBe('plan');
  });

  test('classifies simple questions as trivial/ask', () => {
    const res = classifyTaskComplexity('What is the purpose of this file?');
    expect(res.complexity).toBe('trivial');
    expect(res.suggestedEffort).toBe('low');
    expect(res.suggestedMode).toBe('ask');
  });

  test('incorporates multi-file context into complexity', () => {
    const res = classifyTaskComplexity('Fix the build errors', { filesCount: 5 });
    expect(res.complexity).toBe('complex');
    expect(res.suggestedEffort).toBe('high');
  });
});
