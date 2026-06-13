import { describe, expect, test } from 'bun:test';
import type { Message } from '../../types/message.js';
import { selectPostCompactMessagesToKeep } from './postCompactTail.js';

function assistantMessage(uuid: string, id: string, content: string): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id,
      content,
    },
  };
}

function userMessage(uuid: string, content: string): Message {
  return {
    type: 'user',
    uuid,
    message: {
      content,
    },
  };
}

describe('selectPostCompactMessagesToKeep', () => {
  test('keeps recent API rounds after the latest compact boundary', () => {
    const oldBoundary: Message = {
      type: 'system',
      subtype: 'compact_boundary',
      uuid: 'old-boundary',
      compactMetadata: {
        trigger: 'auto',
        preTokens: 1000,
      },
    };
    const oldSummary = {
      ...userMessage('old-summary', 'old summary'),
      uuid: 'old-summary',
      isCompactSummary: true,
    };
    const messages: Message[] = [
      userMessage('old-user', 'old user'),
      assistantMessage('old-assistant', 'msg-old', 'old assistant'),
      oldBoundary,
      oldSummary,
      userMessage('round-1-user', 'round 1 user'),
      assistantMessage('round-1-assistant', 'round-1', 'round 1 assistant'),
      userMessage('round-2-user', 'round 2 user'),
      assistantMessage('round-2-assistant', 'round-2', 'round 2 assistant'),
      userMessage('round-3-user', 'round 3 user'),
      assistantMessage('round-3-assistant', 'round-3', 'round 3 assistant'),
    ];

    const kept = selectPostCompactMessagesToKeep(messages, 1, 2);

    expect(kept.map(message => message.uuid)).toEqual(['round-2-assistant', 'round-3-user', 'round-3-assistant']);
    expect(kept.some(message => message.uuid === oldBoundary.uuid)).toBe(false);
    expect(kept.some(message => message.uuid === 'old-summary')).toBe(false);
  });
});
