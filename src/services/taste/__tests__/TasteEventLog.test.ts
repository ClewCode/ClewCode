// Tests for TasteEventLog

import { describe, expect, test } from 'bun:test';
import type { TasteEvent } from '../core/TasteTypes.js';
import { TasteEventLog } from '../storage/TasteEventLog.js';

describe('TasteEventLog', () => {
  test('appends events', () => {
    const log = new TasteEventLog();
    const event: TasteEvent = {
      id: 'test-1',
      type: 'manual_rule',
      timestamp: new Date().toISOString(),
      reward: 0.8,
    };
    log.append(event);
    expect(log.getRecentEvents().length).toBe(1);
  });

  test('returns recent events in order', () => {
    const log = new TasteEventLog();
    log.append({ id: '1', type: 'accept', timestamp: '2024-01-01', reward: 1.0 });
    log.append({ id: '2', type: 'reject', timestamp: '2024-01-02', reward: -1.0 });
    log.append({ id: '3', type: 'accept', timestamp: '2024-01-03', reward: 1.0 });

    const recent = log.getRecentEvents(2);
    expect(recent.length).toBe(2);
    expect(recent[0].id).toBe('2');
    expect(recent[1].id).toBe('3');
  });

  test('getAllEvents returns all events', () => {
    const log = new TasteEventLog();
    log.append({ id: 'a', type: 'accept', timestamp: '', reward: 1.0 });
    log.append({ id: 'b', type: 'reject', timestamp: '', reward: -1.0 });
    expect(log.getAllEvents().length).toBe(2);
  });

  test('clear removes all events', () => {
    const log = new TasteEventLog();
    log.append({ id: 'x', type: 'accept', timestamp: '', reward: 1.0 });
    log.clear();
    expect(log.getAllEvents().length).toBe(0);
  });

  test('appendMany appends multiple events', async () => {
    const log = new TasteEventLog();
    const events: TasteEvent[] = [
      { id: 'm1', type: 'accept', timestamp: '', reward: 1.0 },
      { id: 'm2', type: 'accept', timestamp: '', reward: 1.0 },
      { id: 'm3', type: 'reject', timestamp: '', reward: -1.0 },
    ];
    await log.appendMany(events);
    expect(log.getAllEvents().length).toBe(3);
  });

  test('getStats returns correct count', () => {
    const log = new TasteEventLog();
    log.append({ id: 's1', type: 'accept', timestamp: '', reward: 1.0 });
    const stats = log.getStats();
    expect(stats.inMemory).toBe(1);
  });
});
