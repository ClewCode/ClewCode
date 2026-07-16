import { describe, expect, test } from 'bun:test';
import type { Message } from '../types/message.js';
import { hasMessageUuid, isNotEmptyMessage, normalizeMessages } from './messages.js';

// Several message types defined in types/message.ts carry no `.message`
// envelope. normalizeMessages() passes them through via its `default` branch,
// so isNotEmptyMessage() must tolerate them: Messages.tsx runs
// normalizeMessages(messages).filter(isNotEmptyMessage) during render, and a
// throw here takes down the whole REPL with a render error.
describe('isNotEmptyMessage with envelope-less message types', () => {
  const envelopeLess: Message[] = [
    { type: 'system_api_error', error: 'boom', uuid: 'u1' },
    { type: 'system_file_snapshot', uuid: 'u2', files: ['a.ts'] },
    { type: 'system_local_command', uuid: 'u3', command: 'ls', output: '', exit_code: 0 },
    { type: 'stream_event', event: 'message_start', data: {}, uuid: 'u4' },
  ];

  for (const message of envelopeLess) {
    test(`does not throw on ${message.type}`, () => {
      expect(() => isNotEmptyMessage(message)).not.toThrow();
    });

    test(`keeps ${message.type} in the rendered list`, () => {
      expect(isNotEmptyMessage(message)).toBe(true);
    });
  }

  test('survives the Messages.tsx render chain', () => {
    expect(() => normalizeMessages(envelopeLess).filter(isNotEmptyMessage).filter(hasMessageUuid)).not.toThrow();
  });
});

describe('hasMessageUuid', () => {
  test('rejects malformed transcript messages without a uuid', () => {
    const malformed: Message = { type: 'system_api_error', error: 'boom' };

    expect(hasMessageUuid(malformed)).toBe(false);
  });

  test('keeps messages with a non-empty uuid', () => {
    const message: Message = { type: 'system_api_error', error: 'boom', uuid: 'u1' };

    expect(hasMessageUuid(message)).toBe(true);
  });
});
