import { describe, expect, test } from 'bun:test';
import type { Message } from '../../types/message.js';
import {
  getAutoCompactThreshold,
  getBackgroundAutoCompactThreshold,
  mergeBackgroundAutoCompactDelta,
} from './autoCompact.js';
import type { CompactionResult } from './compact.js';
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

describe('getBackgroundAutoCompactThreshold', () => {
  test('starts before the blocking autocompact threshold', () => {
    const threshold = getAutoCompactThreshold('test-model');
    const backgroundThreshold = getBackgroundAutoCompactThreshold('test-model');

    expect(backgroundThreshold).toBeLessThan(threshold);
    expect(backgroundThreshold).toBeGreaterThanOrEqual(Math.floor(threshold * 0.8));
  });
});

describe('mergeBackgroundAutoCompactDelta', () => {
  test('appends messages that arrived after the background compact snapshot tail', () => {
    const result: CompactionResult = {
      boundaryMarker: {
        type: 'system',
        uuid: 'boundary',
        content: 'Conversation compacted',
        compactMetadata: {
          preservedSegment: {
            headUuid: 'kept-tail',
            anchorUuid: 'summary',
            tailUuid: 'snapshot-tail',
          },
        },
      } as CompactionResult['boundaryMarker'],
      summaryMessages: [userMessage('summary', 'summary') as CompactionResult['summaryMessages'][number]],
      attachments: [],
      hookResults: [],
      messagesToKeep: [assistantMessage('snapshot-tail', 'snapshot-tail-message', 'snapshot tail')],
    };
    const currentMessages: Message[] = [
      userMessage('start', 'start'),
      assistantMessage('snapshot-tail', 'snapshot-tail-message', 'snapshot tail'),
      userMessage('delta-user', 'new work'),
      assistantMessage('delta-assistant', 'delta-message', 'new answer'),
    ];

    const merged = mergeBackgroundAutoCompactDelta(result, currentMessages, 'snapshot-tail');

    expect(merged?.messagesToKeep?.map(message => message.uuid)).toEqual([
      'snapshot-tail',
      'delta-user',
      'delta-assistant',
    ]);
    const boundary = merged?.boundaryMarker as CompactionResult['boundaryMarker'] & {
      compactMetadata?: { preservedSegment?: { tailUuid?: string } };
    };
    expect(boundary.compactMetadata?.preservedSegment?.tailUuid).toBe('delta-assistant');
  });

  test('rejects a background result if another compact boundary already happened after its tail', () => {
    const result: CompactionResult = {
      boundaryMarker: {
        type: 'system',
        uuid: 'boundary',
        content: 'Conversation compacted',
      },
      summaryMessages: [],
      attachments: [],
      hookResults: [],
      messagesToKeep: [assistantMessage('snapshot-tail', 'snapshot-tail-message', 'snapshot tail')],
    };
    const currentMessages: Message[] = [
      assistantMessage('snapshot-tail', 'snapshot-tail-message', 'snapshot tail'),
      { type: 'system', subtype: 'compact_boundary', uuid: 'new-boundary' },
      userMessage('delta-user', 'new work'),
    ];

    expect(mergeBackgroundAutoCompactDelta(result, currentMessages, 'snapshot-tail')).toBeUndefined();
  });
});

import { calculateSafeChunkTokens, splitIntoCompactChunks } from './compact.js';

function makeAssistant(uuid: string, id: string, text: string): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id,
      content: [{ type: 'text' as const, text }],
      model: 'test-model',
      role: 'assistant' as const,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

function makeUser(uuid: string, text: string): Message {
  return {
    type: 'user',
    uuid,
    message: {
      content: [{ type: 'text' as const, text }],
      role: 'user' as const,
    },
  };
}

function makeRound(userText: string, assistantText: string, offset: number): Message[] {
  return [makeUser(`u${offset}`, userText), makeAssistant(`a${offset}`, `msg${offset}`, assistantText)];
}

describe('splitIntoCompactChunks', () => {
  test('returns single chunk when messages fit budget', () => {
    const messages = [...makeRound('hello', 'hi there', 1), ...makeRound('how are you', 'good', 2)];
    const chunks = splitIntoCompactChunks(messages, 100000);
    expect(chunks).toHaveLength(1);
  });

  test('splits into multiple chunks when budget is small', () => {
    // Create many rounds with distinct content so token estimation sees real differences
    const messages: Message[] = [];
    for (let i = 0; i < 20; i++) {
      const text = `message content here that takes up some token space ${'x'.repeat(200)}`;
      messages.push(...makeRound(`user says ${text}`, `assistant responds ${text}`, i));
    }
    // Rough token estimate: 200 chars * 20 rounds * 2 messages ≈ needs splitting
    const chunks = splitIntoCompactChunks(messages, 2000);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('each chunk is non-empty and starts with a valid message', () => {
    const messages: Message[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(...makeRound(`user input ${i} ${'x'.repeat(500)}`, `assistant reply ${i} ${'x'.repeat(500)}`, i));
    }
    const chunks = splitIntoCompactChunks(messages, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
      expect(['user', 'assistant'].includes(chunk[0]!.type)).toBe(true);
    }
  });

  test('all messages are included exactly once', () => {
    const messages: Message[] = [];
    for (let i = 0; i < 40; i++) {
      messages.push(...makeRound(`user content ${i} ${'x'.repeat(50)}`, `assistant content ${i} ${'x'.repeat(50)}`, i));
    }
    const chunks = splitIntoCompactChunks(messages, 1000);
    const totalInChunks = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(totalInChunks).toBe(messages.length);
  });
});

describe('calculateSafeChunkTokens', () => {
  test('returns positive value', () => {
    const tokens = calculateSafeChunkTokens('test-model');
    expect(tokens).toBeGreaterThan(0);
  });

  test('returns at least 1000 tokens', () => {
    const tokens = calculateSafeChunkTokens('unknown-tiny-model');
    expect(tokens).toBeGreaterThanOrEqual(1000);
  });
});
