import { describe, expect, test } from 'bun:test';
import type { Message } from '../../types/message.js';
import { estimateCompressibility } from './autoCompact.js';

function assistant(content: unknown[]): Message {
  return { type: 'assistant', message: { content } } as unknown as Message;
}

function user(content: unknown[]): Message {
  return { type: 'user', message: { content } } as unknown as Message;
}

describe('estimateCompressibility', () => {
  test('counts tool_use input, not just the tool name', () => {
    // A 4-char name with a 4000-char command. Counting only the name treats
    // this message as ~1 token instead of ~1000.
    const bigCommand = 'x'.repeat(4000);
    const ratio = estimateCompressibility([
      assistant([{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: bigCommand } }]),
      user([{ type: 'tool_result', tool_use_id: 't1', content: 'y'.repeat(4000) }]),
    ]);

    // Roughly half the context is the tool_use input, so compressibility must
    // land near 0.5. The old name-only count reported ~1.0.
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7);
  });

  test('counts thinking blocks toward the total', () => {
    const ratio = estimateCompressibility([
      assistant([{ type: 'thinking', thinking: 'z'.repeat(8000), signature: 'sig' }]),
      user([{ type: 'tool_result', tool_use_id: 't1', content: 'y'.repeat(2000) }]),
    ]);

    // Thinking dominates, so tool_results are a minority of the context.
    // Ignoring thinking entirely would report 1.0.
    expect(ratio).toBeLessThan(0.35);
  });

  test('is 1.0 when the context really is all tool_result', () => {
    const ratio = estimateCompressibility([
      user([{ type: 'tool_result', tool_use_id: 't1', content: 'y'.repeat(400) }]),
    ]);
    expect(ratio).toBe(1);
  });

  test('returns 0 for an empty conversation', () => {
    expect(estimateCompressibility([])).toBe(0);
  });

  test('never exceeds 1', () => {
    const ratio = estimateCompressibility([
      user([{ type: 'tool_result', tool_use_id: 't1', content: 'y'.repeat(10_000) }]),
    ]);
    expect(ratio).toBeLessThanOrEqual(1);
  });
});
