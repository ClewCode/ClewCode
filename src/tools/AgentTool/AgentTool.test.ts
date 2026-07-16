import { expect, test } from 'bun:test';
import { inputSchema } from './AgentTool.js';

test('accepts explicit parent-model inheritance', () => {
  expect(
    inputSchema().safeParse({
      description: 'Use parent model',
      prompt: 'Inspect the provider routing',
      model: 'inherit',
    }).success,
  ).toBe(true);
});
