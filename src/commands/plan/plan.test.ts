import { describe, expect, it } from 'bun:test';
import { call } from './plan.js';

describe('/plan command', () => {
  it('enables plan mode when currently in default mode', async () => {
    let doneResult = '';
    let stateUpdates: any = null;

    const mockAppState: any = {
      toolPermissionContext: { mode: 'default' },
    };

    const mockContext: any = {
      getAppState: () => mockAppState,
      setAppState: (updater: (prev: any) => any) => {
        stateUpdates = updater(mockAppState);
      },
    };

    await call(
      (result, _meta) => {
        doneResult = result ?? '';
      },
      mockContext,
      'my new plan',
    );

    expect(doneResult).toBe('Enabled plan mode');
    expect(stateUpdates?.toolPermissionContext?.mode).toBe('plan');
  });
});
