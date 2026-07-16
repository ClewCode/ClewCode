import { describe, expect, test } from 'bun:test';
import { parseResetTimeMs, toCodeAssistMessages, toolCallsFromParts } from './CodeAssistProvider.js';

describe('parseResetTimeMs', () => {
  test('parses seconds, minutes, hours', () => {
    expect(parseResetTimeMs('reset after 5s')).toBe(5000);
    expect(parseResetTimeMs('reset after 2m')).toBe(120_000);
    expect(parseResetTimeMs('reset after 1h')).toBe(3_600_000);
  });

  test('parses milliseconds as milliseconds, not minutes', () => {
    expect(parseResetTimeMs('reset after 500ms')).toBe(500);
  });
});

describe('toolCallsFromParts', () => {
  test('assigns unique ids when the same function is called twice', () => {
    const parts = [
      { functionCall: { name: 'Read', args: { path: 'a.ts' } } },
      { functionCall: { name: 'Read', args: { path: 'b.ts' } } },
    ];
    const calls = toolCallsFromParts(parts);
    expect(calls).toHaveLength(2);
    expect(calls[0].id).not.toBe(calls[1].id);
    expect(calls[0].function.name).toBe('Read');
    expect(calls[1].function.name).toBe('Read');
  });
});

describe('toCodeAssistMessages', () => {
  test('recovers the function name from a suffixed tool_call_id', () => {
    const parts = [{ functionCall: { name: 'Read', args: {} } }];
    const [call] = toolCallsFromParts(parts);

    const { contents } = toCodeAssistMessages([{ role: 'tool', tool_call_id: call.id, content: '{"ok":true}' }]);

    expect(contents).toHaveLength(1);
    const part = contents[0].parts[0] as { functionResponse: { name: string } };
    expect(part.functionResponse.name).toBe('Read');
  });

  test('inserts a notice when image content is dropped from a user message', () => {
    const { contents } = toCodeAssistMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is in this image?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } } as any,
        ],
      },
    ]);

    const text = (contents[0].parts[0] as { text: string }).text;
    expect(text).toContain('what is in this image?');
    expect(text).toContain('Image not sent');
  });
});
