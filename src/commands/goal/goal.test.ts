import { beforeEach, describe, expect, it } from 'bun:test';
import { getFullGoalState, setFullGoalState } from '../../utils/sessionGoalState.js';
import { call } from './goal.js';

describe('/goal command handler', () => {
  beforeEach(() => {
    setFullGoalState(null);
  });

  it('reports no active goal when session goal is unset', async () => {
    let resultMessage = '';
    const context: any = {
      getAppState: () => ({}),
      setAppState: () => undefined,
      options: { toolPermissionContext: {} },
    };

    await call(
      result => {
        resultMessage = result ?? '';
      },
      context,
      '',
    );

    expect(resultMessage).toContain('No goal set');
  });

  it('sets an active goal with turn bounds', async () => {
    let resultMessage = '';
    const context: any = {
      getAppState: () => ({}),
      setAppState: () => undefined,
      options: { toolPermissionContext: {} },
    };

    await call(
      result => {
        resultMessage = result ?? '';
      },
      context,
      'make all tests pass or stop after 20 turns',
    );

    expect(resultMessage).toContain('Goal [ACTIVE]');
    const state = getFullGoalState();
    expect(state).not.toBeNull();
    expect(state?.condition).toBe('make all tests pass');
    expect(state?.maxTurns).toBe(20);
  });

  it('pauses and resumes an active goal', async () => {
    const context: any = {
      getAppState: () => ({}),
      setAppState: () => undefined,
      options: { toolPermissionContext: {} },
    };

    // Set goal
    await call(() => undefined, context, 'fix lint errors');
    expect(getFullGoalState()?.paused).toBe(false);

    // Pause goal
    let pauseMsg = '';
    await call(
      res => {
        pauseMsg = res ?? '';
      },
      context,
      'pause',
    );
    expect(pauseMsg).toContain('Goal [PAUSED]');
    expect(getFullGoalState()?.paused).toBe(true);

    // Resume goal
    let resumeMsg = '';
    await call(
      res => {
        resumeMsg = res ?? '';
      },
      context,
      'resume',
    );
    expect(resumeMsg).toContain('Goal [ACTIVE]');
    expect(getFullGoalState()?.paused).toBe(false);
  });

  it('clears an active goal', async () => {
    const context: any = {
      getAppState: () => ({}),
      setAppState: () => undefined,
      options: { toolPermissionContext: {} },
    };

    await call(() => undefined, context, 'refactor parser');
    expect(getFullGoalState()).not.toBeNull();

    let clearMsg = '';
    await call(
      res => {
        clearMsg = res ?? '';
      },
      context,
      'clear',
    );
    expect(clearMsg).toContain('cleared');
    expect(getFullGoalState()).toBeNull();
  });
});
