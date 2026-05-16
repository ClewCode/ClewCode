import { beforeAll, describe, expect, test } from 'bun:test';
import { getClaudeCodeUserAgent } from './userAgent.js';

beforeAll(() => {
  (globalThis as any).MACRO = { VERSION: '0.0.0-test' };
});

describe('userAgent', () => {
  test('getClaudeCodeUserAgent returns string with claude-code prefix', () => {
    const agent = getClaudeCodeUserAgent();
    expect(agent).toMatch(/^claude-code\//);
  });
});
