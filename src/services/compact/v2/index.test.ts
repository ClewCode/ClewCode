import { afterEach, describe, expect, test } from 'bun:test';
import { createCompactSessionState, runCompaction } from './index.js';

const previousAutoCompact = process.env.DISABLE_AUTO_COMPACT;
const previousCompact = process.env.DISABLE_COMPACT;

afterEach(() => {
  if (previousAutoCompact === undefined) delete process.env.DISABLE_AUTO_COMPACT;
  else process.env.DISABLE_AUTO_COMPACT = previousAutoCompact;
  if (previousCompact === undefined) delete process.env.DISABLE_COMPACT;
  else process.env.DISABLE_COMPACT = previousCompact;
});

describe('runCompaction enablement', () => {
  test('keeps manual compaction available when auto-compact is disabled', async () => {
    process.env.DISABLE_AUTO_COMPACT = '1';
    delete process.env.DISABLE_COMPACT;

    const state = createCompactSessionState();
    const result = await runCompaction([], state, 'test-model', { manual: true, force: true });

    expect(state.turn).toBe(1);
    expect(result.plan.rationale).not.toBe('disabled');
  });

  test('disables manual and automatic compaction with the global kill switch', async () => {
    process.env.DISABLE_COMPACT = '1';

    const state = createCompactSessionState();
    const result = await runCompaction([], state, 'test-model', { manual: true, force: true });

    expect(state.turn).toBe(0);
    expect(result.plan.rationale).toBe('disabled');
  });
});
