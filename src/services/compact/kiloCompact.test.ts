import { describe, expect, test } from 'bun:test';
import type { Message } from '../../types/message.js';
import { consolidateToolStates, runKiloCompact, snipDeterministicBloat } from './kiloCompact.js';

describe('KiloCompact Engine', () => {
  test('snipDeterministicBloat should collapse verbose directory trees and stack traces', () => {
    // Generate a simulated massive directory tree listing (over 100 lines)
    const verboseDir = Array.from({ length: 150 }, (_, i) => `├── file_${i}.txt`).join('\n');
    const snipped = snipDeterministicBloat(verboseDir);
    expect(snipped).toContain('Collapsed 135 lines of directory structure');
    expect(snipped.split('\n').length).toBeLessThan(50);
  });

  test('consolidateToolStates should merge sequential failed tool uses', () => {
    const messages: Message[] = [
      {
        type: 'user',
        content: [
          {
            type: 'tool_result',
            name: 'run_command',
            toolUseId: 'u1',
            content: 'Error: Connection Refused',
            isError: true,
          },
        ],
        message: {
          content: [
            {
              type: 'tool_result',
              name: 'run_command',
              toolUseId: 'u1',
              content: 'Error: Connection Refused',
              isError: true,
            },
          ],
        },
        uuid: 'msg-1',
      },
      {
        type: 'assistant',
        content: 'Let me try running another port.',
        message: {
          content: 'Let me try running another port.',
        },
        uuid: 'msg-2',
      },
      {
        type: 'user',
        content: [
          {
            type: 'tool_result',
            name: 'run_command',
            toolUseId: 'u2',
            content: 'Success on port 8080!',
            isError: false,
          },
        ],
        message: {
          content: [
            {
              type: 'tool_result',
              name: 'run_command',
              toolUseId: 'u2',
              content: 'Success on port 8080!',
              isError: false,
            },
          ],
        },
        uuid: 'msg-3',
      },
    ];

    const consolidated = consolidateToolStates(messages);
    // Since u1 was error and u2 succeeded, they should merge to skip the intermediate failure message
    // which leaves msg-3 as the final state.
    expect(consolidated.length).toBe(1);
    expect(consolidated[0].uuid).toBe('msg-3');
  });

  test('runKiloCompact should reduce tokens and return compacted history', async () => {
    // Build a large historical messages list with more than 8 messages
    // to bypass the safety guards (never pruning first 3 or last 3 turns)
    const messages: Message[] = [
      { type: 'system', content: 'You are an assistant', uuid: 'sys' },
      { type: 'user', message: { content: 'First setup instruction' }, uuid: 'u-1' },
      { type: 'assistant', message: { content: 'I have configured the server.' }, uuid: 'a-1' },
      // Middle prunable messages:
      { type: 'user', message: { content: 'Intermediate step 1' }, uuid: 'u-mid-1' },
      { type: 'assistant', message: { content: 'Acknowledged step 1.' }, uuid: 'a-mid-1' },
      { type: 'user', message: { content: 'Intermediate step 2' }, uuid: 'u-mid-2' },
      { type: 'assistant', message: { content: 'Acknowledged step 2.' }, uuid: 'a-mid-2' },
      {
        type: 'user',
        content: [
          {
            type: 'tool_result',
            name: 'glob_files',
            toolUseId: 'u-glob',
            content: Array.from({ length: 200 }, (_, i) => `├── file_${i}.js`).join('\n'),
          },
        ],
        message: {
          content: [
            {
              type: 'tool_result',
              name: 'glob_files',
              toolUseId: 'u-glob',
              content: Array.from({ length: 200 }, (_, i) => `├── file_${i}.js`).join('\n'),
            },
          ],
        },
        uuid: 'u-2',
      },
      // End messages (protected):
      { type: 'assistant', message: { content: 'Found all files successfully.' }, uuid: 'a-2' },
      { type: 'user', message: { content: 'What is the next task?' }, uuid: 'u-3' },
    ];

    const result = await runKiloCompact(messages, { targetTokenLimit: 5 });
    expect(result.wasCompacted).toBe(true);
    expect(result.newTokens).toBeLessThan(result.originalTokens);
  });

  test('runKiloCompact should skip compaction if tokens are already below target limit', async () => {
    const messages: Message[] = [
      { type: 'system', content: 'You are an assistant', uuid: 'sys' },
      { type: 'user', message: { content: 'Hi' }, uuid: 'u-1' },
    ];

    const result = await runKiloCompact(messages, { targetTokenLimit: 1000 });
    expect(result.wasCompacted).toBe(false);
    expect(result.newTokens).toBe(result.originalTokens);
  });

  test('snipDeterministicBloat should return unmodified content if it is under the max line limit', () => {
    const smallContent = 'line 1\nline 2\nline 3';
    const snipped = snipDeterministicBloat(smallContent, 10);
    expect(snipped).toBe(smallContent);
  });
});
