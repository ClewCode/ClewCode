import { describe, expect, test } from 'bun:test';
import type { PermissionMode } from '../permissions/PermissionMode.js';
import { inferTaskModeFromPermissionMode, type TaskMode } from './router.js';

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
