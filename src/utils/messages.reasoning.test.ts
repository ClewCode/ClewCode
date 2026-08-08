import { describe, expect, test } from 'bun:test';
import { normalizeMessagesForAPI } from './messages.js';

describe('normalizeMessagesForAPI reasoning dedupe', () => {
  test('does not synthesize a thinking block when redacted_thinking already exists', () => {
    const [msg] = normalizeMessagesForAPI([
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          reasoning_content: 'stored reasoning',
          content: [
            { type: 'redacted_thinking', data: 'redacted' },
            { type: 'text', text: 'hello' },
          ],
        },
      },
    ]) as { message: { content: unknown[] } }[];

    expect(msg).toBeDefined();
    const blocks = (msg.message.content as { type: string }[]).filter(b => b.type === 'thinking');
    expect(blocks).toHaveLength(0);
  });

  test('still synthesizes a thinking block when only the field is present', () => {
    const [msg] = normalizeMessagesForAPI([
      {
        type: 'assistant',
        uuid: 'a2',
        message: {
          role: 'assistant',
          reasoning_content: 'stored reasoning',
          content: [{ type: 'text', text: 'hello' }],
        },
      },
    ]) as { message: { content: unknown[] } }[];

    expect(msg).toBeDefined();
    const blocks = (msg.message.content as { type: string; thinking?: string }[]).filter(b => b.type === 'thinking');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.thinking).toBe('stored reasoning');
  });
});
