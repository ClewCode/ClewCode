import { expect, test } from 'bun:test';
import { createIncompleteStreamWarning } from './claude.js';

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
