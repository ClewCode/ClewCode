import { describe, expect, test } from 'bun:test';
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs';
import type { AssistantMessage, Message } from '../../types/message.js';
import { canonicalToolArgs, countTrailingRepeats, judgeRepeat, planToolCalls, toolCallKey } from './toolCallDedup.js';

function block(id: string, name: string, input: unknown): ToolUseBlock {
  return { type: 'tool_use', id, name, input } as ToolUseBlock;
}

function assistantWithCalls(...calls: ToolUseBlock[]): Message {
  return {
    type: 'assistant',
    uuid: `uuid-${calls[0]?.id ?? 'x'}`,
    message: { role: 'assistant', content: calls },
  } as unknown as AssistantMessage as Message;
}

describe('canonicalToolArgs', () => {
  test('key order does not change the canonical form', () => {
    expect(canonicalToolArgs({ a: 1, b: 2 })).toBe(canonicalToolArgs({ b: 2, a: 1 }));
  });

  test('sorts nested objects but preserves array order', () => {
    expect(canonicalToolArgs({ outer: { z: 1, a: [{ y: 1, x: 2 }] } })).toBe('{"outer":{"a":[{"x":2,"y":1}],"z":1}}');
    expect(canonicalToolArgs([3, 1, 2])).toBe('[3,1,2]');
  });

  test('different values still differ', () => {
    expect(canonicalToolArgs({ a: 1 })).not.toBe(canonicalToolArgs({ a: 2 }));
  });

  test('does not throw on unserializable input', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalToolArgs(cyclic)).not.toThrow();
  });

  test('tool name is part of the identity', () => {
    expect(toolCallKey('Read', { p: 1 })).not.toBe(toolCallKey('Grep', { p: 1 }));
  });
});

describe('countTrailingRepeats', () => {
  const key = toolCallKey('Grep', { pattern: 'foo' });

  test('counts consecutive identical calls from the end', () => {
    const history = [
      assistantWithCalls(block('1', 'Grep', { pattern: 'foo' })),
      assistantWithCalls(block('2', 'Grep', { pattern: 'foo' })),
    ];
    expect(countTrailingRepeats(history, key)).toBe(2);
  });

  test('a different call in between resets the streak', () => {
    const history = [
      assistantWithCalls(block('1', 'Grep', { pattern: 'foo' })),
      assistantWithCalls(block('2', 'Read', { file: 'a.ts' })),
      assistantWithCalls(block('3', 'Grep', { pattern: 'foo' })),
    ];
    expect(countTrailingRepeats(history, key)).toBe(1);
  });

  test('returns 0 when the most recent call was something else', () => {
    const history = [
      assistantWithCalls(block('1', 'Grep', { pattern: 'foo' })),
      assistantWithCalls(block('2', 'Read', { file: 'a.ts' })),
    ];
    expect(countTrailingRepeats(history, key)).toBe(0);
  });

  test('matches regardless of argument key order', () => {
    const history = [assistantWithCalls(block('1', 'Grep', { b: 2, a: 1 }))];
    expect(countTrailingRepeats(history, toolCallKey('Grep', { a: 1, b: 2 }))).toBe(1);
  });
});

describe('judgeRepeat escalation', () => {
  const args = canonicalToolArgs({ pattern: 'foo' });

  test('stays quiet below the first threshold', () => {
    expect(judgeRepeat(2, 'Grep', args).action).toBe('none');
    expect(judgeRepeat(2, 'Grep', args).reminder).toBeUndefined();
  });

  test('escalates through remind, warn, stop-calling, refuse', () => {
    expect(judgeRepeat(3, 'Grep', args).action).toBe('remind');
    expect(judgeRepeat(5, 'Grep', args).action).toBe('warn');
    expect(judgeRepeat(8, 'Grep', args).action).toBe('stop-calling');
    expect(judgeRepeat(12, 'Grep', args).action).toBe('refuse');
  });

  test('the warn level names the tool and the repeat count', () => {
    const reminder = judgeRepeat(6, 'Grep', args).reminder ?? '';
    expect(reminder).toContain('Grep');
    expect(reminder).toContain('repeated_times: 6');
  });

  test('refusal carries no reminder — the call does not run at all', () => {
    expect(judgeRepeat(99, 'Grep', args).reminder).toBeUndefined();
  });
});

describe('planToolCalls', () => {
  test('marks later identical calls in the same turn as duplicates of the first', () => {
    const plan = planToolCalls(
      [
        block('a', 'Read', { file: 'x.ts' }),
        block('b', 'Read', { file: 'x.ts' }),
        block('c', 'Read', { file: 'y.ts' }),
      ],
      [],
    );

    expect(plan[0]!.duplicateOf).toBeUndefined();
    expect(plan[1]!.duplicateOf).toBe('a');
    expect(plan[2]!.duplicateOf).toBeUndefined();
  });

  test('duplicates are detected across argument key order', () => {
    const plan = planToolCalls([block('a', 'Read', { p: 1, q: 2 }), block('b', 'Read', { q: 2, p: 1 })], []);
    expect(plan[1]!.duplicateOf).toBe('a');
  });

  test('history drives the verdict for the first occurrence only', () => {
    const history = Array.from({ length: 4 }, (_, i) => assistantWithCalls(block(`h${i}`, 'Grep', { pattern: 'foo' })));
    const plan = planToolCalls(
      [block('a', 'Grep', { pattern: 'foo' }), block('b', 'Grep', { pattern: 'foo' })],
      history,
    );

    expect(plan[0]!.verdict.action).toBe('remind');
    expect(plan[0]!.verdict.streak).toBe(4);
    // The duplicate never runs, so it is never reminded.
    expect(plan[1]!.verdict.action).toBe('none');
  });

  test('a fresh call is left alone', () => {
    const plan = planToolCalls([block('a', 'Read', { file: 'x.ts' })], []);
    expect(plan[0]!.verdict.action).toBe('none');
    expect(plan[0]!.duplicateOf).toBeUndefined();
  });
});
