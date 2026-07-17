import { describe, expect, test } from 'bun:test';
import { nextCronRunMs } from '../../utils/cronTasks.js';
import { buildFollowupPrompt, describeWhen, oneShotCronFor } from './ScheduleFollowupTool.js';

describe('oneShotCronFor', () => {
  test('produces a 5-field cron pinned to the target minute', () => {
    const target = new Date(2026, 6, 17, 14, 32, 0); // 2026-07-17 14:32 local
    expect(oneShotCronFor(target)).toBe('32 14 17 7 *');
  });

  test('cron resolves to the target time when it is in the future', () => {
    const now = Date.now();
    const target = new Date(now + 30 * 60_000);
    const cron = oneShotCronFor(target);
    const next = nextCronRunMs(cron, now);
    expect(next).not.toBeNull();
    // Same minute-of-day as the target (cron has 1-minute resolution).
    expect(new Date(next as number).getMinutes()).toBe(target.getMinutes());
    expect(new Date(next as number).getHours()).toBe(target.getHours());
    // And it fires within roughly the intended window, not a year out.
    expect((next as number) - now).toBeLessThan(31 * 60_000);
  });
});

describe('describeWhen', () => {
  test('formats sub-hour delays as minutes', () => {
    const target = new Date(2026, 6, 17, 9, 5, 0);
    expect(describeWhen(target, 45)).toBe('in 45m · at 09:05');
  });

  test('formats hour+ delays as hours and minutes', () => {
    const target = new Date(2026, 6, 17, 15, 7, 0);
    expect(describeWhen(target, 150)).toBe('in 2h30m · at 15:07');
    expect(describeWhen(target, 120)).toBe('in 2h · at 15:07');
  });
});

describe('buildFollowupPrompt', () => {
  test('includes summary and remaining steps', () => {
    const p = buildFollowupPrompt('wiring the retry queue', '- add backoff\n- write test');
    expect(p).toContain('wiring the retry queue');
    expect(p).toContain("What's left:");
    expect(p).toContain('add backoff');
  });

  test('omits the remaining section when not provided', () => {
    const p = buildFollowupPrompt('just this');
    expect(p).toContain('just this');
    expect(p).not.toContain("What's left:");
  });
});
