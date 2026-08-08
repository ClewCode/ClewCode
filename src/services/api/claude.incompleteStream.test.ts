import { expect, test } from 'bun:test';
import { assistantMessageToMessageParam, createIncompleteStreamWarning } from './claude.js';

test('creates a visible API warning for a truncated streamed response', () => {
  const warning = createIncompleteStreamWarning('test-model', 'request-1');

  expect(warning.type).toBe('assistant');
  expect(warning.isApiErrorMessage).toBe(true);
  expect(warning.apiError).toBe('connection_closed_mid_response');
  expect(warning.message.content).toEqual([
    {
      type: 'text',
      text: 'API Error: Connection closed mid-response. The response above may be incomplete.',
    },
  ]);
});

test('preserves reasoning_content when converting assistant history', () => {
  const message = assistantMessageToMessageParam(
    {
      type: 'assistant',
      uuid: 'assistant-1',
      message: {
        role: 'assistant',
        reasoning_content: 'must round-trip verbatim',
        content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'x' } }],
      },
    },
    false,
    false,
  );

  expect((message as typeof message & { reasoning_content?: string }).reasoning_content).toBe(
    'must round-trip verbatim',
  );
});

test('keeps reasoning_content even when a thinking block is already present', () => {
  const message = assistantMessageToMessageParam(
    {
      type: 'assistant',
      uuid: 'assistant-2',
      message: {
        role: 'assistant',
        reasoning_content: 'stored on the message',
        content: [
          { type: 'thinking', thinking: 'stored on the message', signature: '' },
          { type: 'text', text: 'the answer' },
        ],
      },
    },
    false,
    false,
  );

  // Some thinking-mode providers require the verbatim reasoning_content field
  // passed back alongside the thinking block — dropping it yields a 400
  // ("The reasoning_content in the thinking mode must be passed back to the API").
  expect((message as typeof message & { reasoning_content?: string }).reasoning_content).toBe('stored on the message');
  expect(message.content).toEqual([
    { type: 'thinking', thinking: 'stored on the message', signature: '' },
    { type: 'text', text: 'the answer' },
  ]);
});
