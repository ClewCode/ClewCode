import { describe, expect, test } from 'bun:test';
import {
  buildDelegateCall,
  missingFieldsFor,
  REQUIRED_FIELDS,
  SCHEDULE_ACTIONS,
  type ScheduleInput,
} from './ScheduleTool.js';

function input(partial: Partial<ScheduleInput> & { action: ScheduleInput['action'] }): ScheduleInput {
  return partial as ScheduleInput;
}

describe('schedule required fields', () => {
  test('every action declares its requirements', () => {
    for (const action of SCHEDULE_ACTIONS) {
      expect(REQUIRED_FIELDS[action]).toBeDefined();
    }
  });

  test('refuses to schedule when the essentials are missing', () => {
    expect(missingFieldsFor(input({ action: 'followup' }))).toEqual(['summary', 'delayMinutes']);
    expect(missingFieldsFor(input({ action: 'create', cron: '* * * * *' }))).toEqual(['prompt']);
    expect(missingFieldsFor(input({ action: 'delete' }))).toEqual(['id']);
  });

  test('list needs nothing', () => {
    expect(missingFieldsFor(input({ action: 'list' }))).toEqual([]);
  });

  test('does not throw when input is missing', () => {
    expect(missingFieldsFor(undefined as unknown as ScheduleInput)).toEqual(['action']);
  });

  test('accepts a nested input wrapper', () => {
    expect(missingFieldsFor({ action: 'list' })).toEqual([]);
  });
});

describe('schedule dispatch', () => {
  test('every action maps to a delegate', () => {
    for (const action of SCHEDULE_ACTIONS) {
      const { tool } = buildDelegateCall(
        input({ action, summary: 's', delayMinutes: 5, cron: '* * * * *', prompt: 'p', id: 'x' }),
      );
      expect(typeof tool.call).toBe('function');
    }
  });

  test('followup passes the notes future-you will receive', () => {
    const { args } = buildDelegateCall(
      input({ action: 'followup', summary: 'wiring retries', remaining: '- backoff', delayMinutes: 45 }),
    );
    expect(args).toMatchObject({ summary: 'wiring retries', remaining: '- backoff', delayMinutes: 45 });
  });

  test('create defaults to recurring and session-only', () => {
    const { args } = buildDelegateCall(input({ action: 'create', cron: '*/5 * * * *', prompt: 'check CI' }));
    expect(args).toMatchObject({ recurring: true, durable: false });
  });

  test('explicit recurring:false and durable:true are honored', () => {
    const { args } = buildDelegateCall(
      input({ action: 'create', cron: '30 14 28 2 *', prompt: 'x', recurring: false, durable: true }),
    );
    expect(args).toMatchObject({ recurring: false, durable: true });
  });

  test('delete forwards only the id', () => {
    expect(buildDelegateCall(input({ action: 'delete', id: 'job-7' })).args).toEqual({ id: 'job-7' });
  });
});
