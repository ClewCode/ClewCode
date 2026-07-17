import { describe, expect, test } from 'bun:test';
import { pluralize } from './format.js';

describe('pluralize', () => {
  test('uses the singular word for exactly 1', () => {
    expect(pluralize(1, 'message')).toBe('1 message');
    expect(pluralize(1, 'memory', 'memories')).toBe('1 memory');
  });

  test('appends "s" for 0 and >1 by default', () => {
    expect(pluralize(0, 'message')).toBe('0 messages');
    expect(pluralize(2, 'message')).toBe('2 messages');
  });

  test('uses the explicit plural for irregular words', () => {
    expect(pluralize(0, 'memory', 'memories')).toBe('0 memories');
    expect(pluralize(3, 'memory', 'memories')).toBe('3 memories');
    expect(pluralize(2, 'entry', 'entries')).toBe('2 entries');
  });
});
