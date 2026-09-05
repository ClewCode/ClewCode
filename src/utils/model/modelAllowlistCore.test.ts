import { describe, expect, test } from 'bun:test';
import { isModelAllowedByList } from './modelAllowlistCore.js';

const resolveAlias = (model: string): string => {
  switch (model) {
    case 'opus':
    case 'best':
      return 'claude-opus-4-6-20250514';
    case 'sonnet':
    case 'opusplan':
      return 'claude-sonnet-4-6-20250514';
    case 'haiku':
      return 'claude-haiku-4-5-20251001';
    default:
      return model;
  }
};

describe('isModelAllowedByList', () => {
  test('allows everything when no list is configured and nothing for an empty list', () => {
    expect(isModelAllowedByList('claude-opus-4-6', undefined, resolveAlias)).toBe(true);
    expect(isModelAllowedByList('claude-opus-4-6', [], resolveAlias)).toBe(false);
  });

  test('supports family aliases and narrows them when a version entry exists', () => {
    expect(isModelAllowedByList('claude-opus-4-6-20250514', ['opus'], resolveAlias)).toBe(true);
    expect(isModelAllowedByList('claude-opus-4-6-20250514', ['opus', 'opus-4-5'], resolveAlias)).toBe(false);
    expect(isModelAllowedByList('claude-opus-4-5-20251101', ['opus', 'opus-4-5'], resolveAlias)).toBe(true);
  });

  test('matches aliases bidirectionally and version prefixes at segment boundaries', () => {
    expect(isModelAllowedByList('opus', ['claude-opus-4-6-20250514'], resolveAlias)).toBe(true);
    expect(isModelAllowedByList('claude-opus-4-6-20250514', ['best'], resolveAlias)).toBe(true);
    expect(isModelAllowedByList('claude-opus-4-5-20251101', ['opus-4-5'], resolveAlias)).toBe(true);
    expect(isModelAllowedByList('claude-opus-4-50-20251101', ['opus-4-5'], resolveAlias)).toBe(false);
  });
});
