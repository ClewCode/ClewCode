import { expect, test } from 'bun:test';
import { CODING_SYSTEM_PROMPT } from './codingSystemPrompt.js';

test('exports the coding guidance without a profile heading', () => {
  expect(CODING_SYSTEM_PROMPT).toContain('implement software changes in the current workspace');
  expect(CODING_SYSTEM_PROMPT).not.toContain('# Profile');
  expect(CODING_SYSTEM_PROMPT).not.toContain('personal profile');
});
