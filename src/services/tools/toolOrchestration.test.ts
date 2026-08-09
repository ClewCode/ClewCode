import { describe, expect, test } from 'bun:test';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type { Message } from '../../types/message.js';
import { interceptResult, retargetToolResults } from './toolOrchestration.js';

function resultMessage(toolUseId: string, content: ContentBlockParam['type'] extends never ? never : unknown): Message {
  return {
    type: 'user',
    uuid: 'uuid-1',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content }],
    },
  } as unknown as Message;
}

function toolResultOf(message: Message | undefined): Record<string, unknown> {
  const content = (message as { message: { content: ContentBlockParam[] } }).message.content;
  return content.find(block => block.type === 'tool_result') as unknown as Record<string, unknown>;
}

describe('interceptResult', () => {
  test('appends the reminder to a string tool_result and records it', () => {
    const reminders = new Map([['t1', '\n<reminder>']]);
    const results = new Map<string, ContentBlockParam[]>();

    const out = interceptResult(resultMessage('t1', 'found 3 matches'), reminders, results);

    expect(toolResultOf(out).content).toBe('found 3 matches\n<reminder>');
    // Recorded post-reminder so a duplicate sees exactly what the original saw.
    expect(results.get('t1')).toBeDefined();
    // Consumed — a reminder must not be appended twice.
    expect(reminders.has('t1')).toBe(false);
  });

  test('appends into the last text part when the result is a block list', () => {
    const reminders = new Map([['t1', '\n<reminder>']]);
    const out = interceptResult(
      resultMessage('t1', [{ type: 'text', text: 'line one' }]),
      reminders,
      new Map<string, ContentBlockParam[]>(),
    );

    expect(toolResultOf(out).content).toEqual([{ type: 'text', text: 'line one\n<reminder>' }]);
  });

  test('adds a text part when the block list does not end in text', () => {
    const reminders = new Map([['t1', '\n<reminder>']]);
    const out = interceptResult(
      resultMessage('t1', [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x' } }]),
      reminders,
      new Map<string, ContentBlockParam[]>(),
    );

    const content = toolResultOf(out).content as ContentBlockParam[];
    expect(content).toHaveLength(2);
    expect(content[1]).toEqual({ type: 'text', text: '\n<reminder>' });
  });

  test('records the result even when there is no reminder', () => {
    const results = new Map<string, ContentBlockParam[]>();
    const message = resultMessage('t1', 'plain');

    const out = interceptResult(message, new Map(), results);

    expect(out).toBe(message);
    expect(results.get('t1')).toBeDefined();
  });

  test('passes through messages that carry no tool_result', () => {
    const progress = { type: 'progress', uuid: 'p' } as unknown as Message;
    expect(interceptResult(progress, new Map(), new Map())).toBe(progress);
    expect(interceptResult(undefined, new Map(), new Map())).toBeUndefined();
  });
});

describe('retargetToolResults', () => {
  test('re-points the tool_result at the duplicate call id', () => {
    const content: ContentBlockParam[] = [
      { type: 'tool_result', tool_use_id: 'orig', content: 'output' },
      { type: 'text', text: 'sidecar' },
    ];

    const out = retargetToolResults(content, 'orig', 'dup');

    expect((out[0] as { tool_use_id: string }).tool_use_id).toBe('dup');
    // Non-tool_result blocks ride along untouched.
    expect(out[1]).toEqual({ type: 'text', text: 'sidecar' });
  });

  test('leaves results belonging to other calls alone', () => {
    const content: ContentBlockParam[] = [{ type: 'tool_result', tool_use_id: 'other', content: 'output' }];
    expect(retargetToolResults(content, 'orig', 'dup')).toEqual(content);
  });
});
