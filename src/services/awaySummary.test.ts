import { describe, expect, test } from 'bun:test';
import type { Message } from '../types/message.js';
import { hasRecappableConversation } from './awaySummary.js';

function user(text: string, extra: Record<string, unknown> = {}): Message {
  return {
    type: 'user',
    uuid: `u-${text}`,
    timestamp: new Date().toISOString(),
    message: { role: 'user', content: text },
    ...extra,
  } as unknown as Message;
}

function assistant(text: string): Message {
  return {
    type: 'assistant',
    uuid: `a-${text}`,
    timestamp: new Date().toISOString(),
    message: { id: 'm', model: 'test-model', content: [{ type: 'text', text }] },
  } as unknown as Message;
}

function attachment(): Message {
  return {
    type: 'attachment',
    uuid: 'att',
    timestamp: new Date().toISOString(),
    attachment: { type: 'file', filename: 'CLAUDE.md' },
  } as unknown as Message;
}

function systemMessage(subtype: string): Message {
  return { type: 'system', subtype, uuid: `s-${subtype}`, timestamp: new Date().toISOString() } as unknown as Message;
}

describe('hasRecappableConversation', () => {
  test('an empty session has nothing to recap', () => {
    expect(hasRecappableConversation([])).toBe(false);
  });

  test('a session that was never talked to has nothing to recap', () => {
    // This is the case the old `messages.length === 0` check missed: a fresh
    // session still carries attachments and system entries, so a bare length
    // check produced a "Goal: … Next: …" handoff for work that never happened.
    expect(hasRecappableConversation([attachment(), systemMessage('init')])).toBe(false);
  });

  test('meta user messages do not count as the user having said anything', () => {
    expect(hasRecappableConversation([user('injected context', { isMeta: true }), assistant('hi')])).toBe(false);
  });

  test('a tool_result carrier does not count as a user turn', () => {
    expect(hasRecappableConversation([user('result', { toolUseResult: {} }), assistant('hi')])).toBe(false);
  });

  test('a compact summary does not count as a user turn', () => {
    expect(hasRecappableConversation([user('summary', { isCompactSummary: true }), assistant('hi')])).toBe(false);
  });

  test('a user turn with no reply yet is not recappable', () => {
    expect(hasRecappableConversation([user('hello')])).toBe(false);
  });

  test('an assistant message with no user turn is not recappable', () => {
    expect(hasRecappableConversation([attachment(), assistant('starting up')])).toBe(false);
  });

  test('a real exchange is recappable', () => {
    expect(hasRecappableConversation([user('hello'), assistant('hi there')])).toBe(true);
  });

  test('a real exchange buried among attachments and meta is still recappable', () => {
    expect(
      hasRecappableConversation([
        attachment(),
        user('ctx', { isMeta: true }),
        systemMessage('init'),
        user('fix the bug'),
        assistant('done'),
      ]),
    ).toBe(true);
  });
});
