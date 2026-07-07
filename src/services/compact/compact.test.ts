import { describe, expect, test } from 'bun:test';
import type { Message } from '../../types/message.js';
import {
  AUTOCOMPACT_BUFFER_TOKENS,
  AUTOCOMPACT_HARD_BUFFER_TOKENS,
  COMPACT_REGRET_WINDOW_TURNS,
  collectToolSignatures,
  computeDroppedToolSignatures,
  getAutoCompactHardThreshold,
  getAutoCompactThreshold,
  getBackgroundAutoCompactThreshold,
  getEffectiveContextWindowSize,
  isAtNaturalBoundary,
  estimateCompressibility,
  checkCompactRegret,
  resetCompactRegretState,
  tickCompactRegret,
  mergeBackgroundAutoCompactDelta,
} from './autoCompact.js';
import type { CompactionResult } from './compact.js';
import { DUPLICATE_TOOL_RESULT_CLEARED_MESSAGE, maybeDuplicateToolResultMicrocompact } from './microCompact.js';
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
  test('keeps enough foreground headroom for the next API request', () => {
    const effectiveWindow = getEffectiveContextWindowSize('test-model');
    const threshold = getAutoCompactThreshold('test-model');

    expect(effectiveWindow - threshold).toBe(AUTOCOMPACT_BUFFER_TOKENS);
    expect(AUTOCOMPACT_BUFFER_TOKENS).toBeGreaterThanOrEqual(40_000);
  });

  test('starts before the blocking autocompact threshold', () => {
    const threshold = getAutoCompactThreshold('test-model');
    const backgroundThreshold = getBackgroundAutoCompactThreshold('test-model');

    expect(backgroundThreshold).toBeLessThan(threshold);
    expect(backgroundThreshold).toBeGreaterThanOrEqual(Math.floor(threshold * 0.8));
  });
});

describe('isAtNaturalBoundary', () => {
  test('assistant with text only is a boundary', () => {
    const messages = [userMessage('u1', 'hello'), assistantMessage('a1', 'msg1', 'hi there!')];
    expect(isAtNaturalBoundary(messages)).toBe(true);
  });

  test('assistant with tool_use blocks is NOT a boundary', () => {
    const messages: Message[] = [
      userMessage('u1', 'hello'),
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          id: 'msg1',
          content: [{ type: 'tool_use' as const, id: 'tu1', name: 'Read', input: { file_path: 'file.ts' } }],
          model: 'test-model',
          role: 'assistant' as const,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
    ];
    expect(isAtNaturalBoundary(messages)).toBe(false);
  });

  test('user with tool_result blocks is NOT a boundary', () => {
    const messages: Message[] = [
      {
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user' as const,
          content: [{ type: 'tool_result' as const, tool_use_id: 'tu1', content: 'result' }],
        },
      },
    ];
    expect(isAtNaturalBoundary(messages)).toBe(false);
  });

  test('user with text content is a boundary', () => {
    const messages: Message[] = [userMessage('u1', 'new prompt')];
    expect(isAtNaturalBoundary(messages)).toBe(true);
  });

  test('empty messages returns true', () => {
    expect(isAtNaturalBoundary([])).toBe(true);
  });

  test('assistant with both text and tool_use is NOT a boundary', () => {
    const messages: Message[] = [
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          id: 'msg1',
          content: [
            { type: 'text' as const, text: 'Let me check that file...' },
            { type: 'tool_use' as const, id: 'tu1', name: 'Read', input: { file_path: 'file.ts' } },
          ],
          model: 'test-model',
          role: 'assistant' as const,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
    ];
    expect(isAtNaturalBoundary(messages)).toBe(false);
  });
});

describe('estimateCompressibility', () => {
  test('chat-only session has low compressibility', () => {
    const messages: Message[] = [
      userMessage('u1', 'hello'),
      assistantMessage('a1', 'msg1', 'hi there'),
      userMessage('u2', 'how are you?'),
    ];
    const ratio = estimateCompressibility(messages);
    expect(ratio).toBe(0); // No tool results
  });

  test('tool-heavy session has high compressibility', () => {
    const messages: Message[] = [
      {
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user' as const,
          content: [{ type: 'tool_result' as const, tool_use_id: 'tu1', content: 'x'.repeat(1000) }],
        },
      },
      assistantMessage('a1', 'msg1', 'short reply'),
    ];
    const ratio = estimateCompressibility(messages);
    expect(ratio).toBeGreaterThan(0.5); // tool_result dominates
  });

  test('empty messages returns 0', () => {
    expect(estimateCompressibility([])).toBe(0);
  });
});

describe('getAutoCompactHardThreshold', () => {
  test('hard threshold is soft threshold plus buffer', () => {
    const soft = getAutoCompactThreshold('test-model');
    const hard = getAutoCompactHardThreshold('test-model');
    expect(hard - soft).toBe(AUTOCOMPACT_HARD_BUFFER_TOKENS);
    expect(AUTOCOMPACT_HARD_BUFFER_TOKENS).toBeGreaterThan(0);
  });
});

describe('checkCompactRegret', () => {
  test('detects regret when tool matches dropped signature', () => {
    const dropped = new Set<string>(['Read:src/file.ts']);
    resetCompactRegretState(dropped);

    expect(checkCompactRegret('Read', { file_path: 'src/file.ts' })).toBe(true);
  });

  test('no regret when tool does not match dropped signature', () => {
    const dropped = new Set<string>(['Read:src/file.ts']);
    resetCompactRegretState(dropped);

    expect(checkCompactRegret('Grep', { pattern: 'foo' })).toBe(false);
  });

  test('no regret when no dropped signatures', () => {
    resetCompactRegretState(new Set());
    expect(checkCompactRegret('Read', { file_path: 'src/file.ts' })).toBe(false);
  });

  test('signature match is case sensitive on tool name', () => {
    const dropped = new Set<string>(['Read:src/file.ts']);
    resetCompactRegretState(dropped);

    expect(checkCompactRegret('read', { file_path: 'src/file.ts' })).toBe(false); // case mismatch
  });

  test('a matched signature is consumed (not double-counted)', () => {
    resetCompactRegretState(new Set<string>(['Read:src/file.ts']));

    expect(checkCompactRegret('Read', { file_path: 'src/file.ts' })).toBe(true);
    // Second reference to the same drop is not regret again
    expect(checkCompactRegret('Read', { file_path: 'src/file.ts' })).toBe(false);
  });

  test('no regret once the observation window has expired', () => {
    resetCompactRegretState(new Set<string>(['Read:src/file.ts']));

    // Advance past the window
    for (let i = 0; i <= COMPACT_REGRET_WINDOW_TURNS; i++) {
      tickCompactRegret();
    }

    expect(checkCompactRegret('Read', { file_path: 'src/file.ts' })).toBe(false);
  });

  test('regret still counts on the last turn inside the window', () => {
    resetCompactRegretState(new Set<string>(['Read:src/file.ts']));
    for (let i = 0; i < COMPACT_REGRET_WINDOW_TURNS; i++) {
      tickCompactRegret();
    }
    expect(checkCompactRegret('Read', { file_path: 'src/file.ts' })).toBe(true);
  });
});

describe('computeDroppedToolSignatures', () => {
  function toolUseMsg(uuid: string, name: string, input: Record<string, unknown>): Message {
    return {
      type: 'assistant',
      uuid,
      message: {
        id: uuid,
        content: [{ type: 'tool_use' as const, id: `${uuid}-tu`, name, input }],
        model: 'test-model',
        role: 'assistant' as const,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    };
  }

  test('kept tool calls are excluded from the dropped set', () => {
    const all = [
      toolUseMsg('a1', 'Read', { file_path: 'a.ts' }),
      toolUseMsg('a2', 'Read', { file_path: 'b.ts' }),
    ];
    const kept = [all[1]!]; // b.ts survives
    const dropped = computeDroppedToolSignatures(all, kept);

    expect(dropped.has('Read:a.ts')).toBe(true);
    expect(dropped.has('Read:b.ts')).toBe(false);
  });

  test('collectToolSignatures gathers all tool_use signatures', () => {
    const sigs = collectToolSignatures([
      toolUseMsg('a1', 'Read', { file_path: 'a.ts' }),
      toolUseMsg('a2', 'Bash', { command: 'ls' }),
    ]);
    expect(sigs).toEqual(new Set(['Read:a.ts', 'Bash:ls']));
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

function toolUseMessage(uuid: string, id: string, name: string, input: Record<string, unknown>): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id: `msg-${uuid}`,
      content: [{ type: 'tool_use' as const, id, name, input }],
      model: 'test-model',
      role: 'assistant' as const,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

function toolResultMessage(uuid: string, toolUseId: string, content: string): Message {
  return {
    type: 'user',
    uuid,
    message: {
      role: 'user' as const,
      content: [{ type: 'tool_result' as const, tool_use_id: toolUseId, content }],
    },
  };
}

describe('maybeDuplicateToolResultMicrocompact', () => {
  test('clears older duplicate search results and keeps the latest result', () => {
    const firstResult = `old result\n${'x'.repeat(2000)}`;
    const latestResult = `latest result\n${'y'.repeat(2000)}`;
    const messages: Message[] = [
      toolUseMessage('a1', 'tool-1', 'Grep', { pattern: 'findMe', path: 'src' }),
      toolResultMessage('u1', 'tool-1', firstResult),
      toolUseMessage('a2', 'tool-2', 'Grep', { path: 'src', pattern: 'findMe' }),
      toolResultMessage('u2', 'tool-2', latestResult),
    ];

    const result = maybeDuplicateToolResultMicrocompact(messages, 'repl_main_thread');

    const firstContent = result?.messages[1]?.type === 'user' ? result.messages[1].message.content[0] : undefined;
    const latestContent = result?.messages[3]?.type === 'user' ? result.messages[3].message.content[0] : undefined;
    expect(firstContent?.type === 'tool_result' ? firstContent.content : undefined).toBe(
      DUPLICATE_TOOL_RESULT_CLEARED_MESSAGE,
    );
    expect(latestContent?.type === 'tool_result' ? latestContent.content : undefined).toBe(latestResult);
  });

  test('does not clear duplicate Read results', () => {
    const content = `file content\n${'x'.repeat(2000)}`;
    const messages: Message[] = [
      toolUseMessage('a1', 'tool-1', 'Read', { file_path: 'src/index.ts' }),
      toolResultMessage('u1', 'tool-1', content),
      toolUseMessage('a2', 'tool-2', 'Read', { file_path: 'src/index.ts' }),
      toolResultMessage('u2', 'tool-2', content),
    ];

    expect(maybeDuplicateToolResultMicrocompact(messages, 'repl_main_thread')).toBeNull();
  });
});
