import { describe, expect, test } from 'bun:test';
import type { AssistantMessage } from '../../types/message.js';
import { getParentCacheSuppressReason } from './promptSuggestion.js';

function assistantWithUsage(usage: Record<string, number>): AssistantMessage {
  return { message: { usage } } as unknown as AssistantMessage;
}

describe('prompt suggestion cache suppression', () => {
  test('counts only uncached input and output tokens', () => {
    expect(
      getParentCacheSuppressReason(
        assistantWithUsage({
          input_tokens: 100_000,
          cache_read_input_tokens: 90_000,
          output_tokens: 1_000,
        }),
      ),
    ).toBeNull();
    expect(getParentCacheSuppressReason(assistantWithUsage({ input_tokens: 60_000, output_tokens: 1_000 }))).toBe(
      'cache_cold',
    );
  });
});
