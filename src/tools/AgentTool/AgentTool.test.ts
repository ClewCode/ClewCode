import { describe, expect, it, test } from 'bun:test';
import { deriveAgentDescription, inputSchema } from './AgentTool.js';

describe('AgentTool inputSchema validation', () => {
  test('accepts explicit parent-model inheritance', () => {
    expect(
      inputSchema().safeParse({
        description: 'Use parent model',
        prompt: 'Inspect the provider routing',
        model: 'inherit',
      }).success,
    ).toBe(true);
  });

  test('accepts valid model choices', () => {
    for (const model of ['sonnet', 'opus', 'haiku', 'inherit'] as const) {
      const res = inputSchema().safeParse({
        description: 'Run task',
        prompt: 'Do something',
        model,
      });
      expect(res.success).toBe(true);
    }
  });

  test('accepts subagent_type and background flags', () => {
    const res = inputSchema().safeParse({
      description: 'Explore codebase',
      prompt: 'Find all callers of auth',
      subagent_type: 'Explore',
      run_in_background: true,
    });
    expect(res.success).toBe(true);
  });

  test('accepts a missing description and derives one from the prompt', () => {
    expect(
      inputSchema().safeParse({
        prompt: 'No description provided',
      }).success,
    ).toBe(true);
    expect(deriveAgentDescription('Inspect the provider routing and report findings')).toBe(
      'Inspect the provider routing and',
    );
    expect(deriveAgentDescription('   ')).toBe('Agent task');
  });

  test('rejects a missing prompt', () => {
    expect(
      inputSchema().safeParse({
        description: 'No prompt provided',
      }).success,
    ).toBe(false);
  });
});
