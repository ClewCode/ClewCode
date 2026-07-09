import { afterEach, describe, expect, test } from 'bun:test';
import { resolveSubagentDefaultModel } from './agent.js';

describe('subagent model defaults', () => {
  afterEach(() => {
    delete process.env.CLEW_CODE_SUBAGENT_MODEL;
  });

  test('defaults to inherit when nothing is configured', () => {
    expect(resolveSubagentDefaultModel()).toBe('inherit');
  });

  test('uses the configured subagent model', () => {
    expect(resolveSubagentDefaultModel('chatgpt/gpt-5.5')).toBe('chatgpt/gpt-5.5');
  });

  test('lets the env override win over settings', () => {
    process.env.CLEW_CODE_SUBAGENT_MODEL = 'openai/gpt-5';
    expect(resolveSubagentDefaultModel('chatgpt/gpt-5.5')).toBe('openai/gpt-5');
  });
});
