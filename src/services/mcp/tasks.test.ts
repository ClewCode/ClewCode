import { beforeEach, describe, expect, test } from 'bun:test';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { clearToolTaskSupport, getToolTaskSupport, recordToolTaskSupport } from './tasks.js';

function tool(name: string, taskSupport?: 'optional' | 'required' | 'forbidden'): Tool {
  return {
    name,
    inputSchema: { type: 'object' },
    ...(taskSupport ? { execution: { taskSupport } } : {}),
  };
}

describe('tool task support', () => {
  beforeEach(() => {
    clearToolTaskSupport('server');
  });

  test('records optional and required, ignores forbidden and unset', () => {
    recordToolTaskSupport('server', [
      tool('slow', 'required'),
      tool('maybe', 'optional'),
      tool('never', 'forbidden'),
      tool('plain'),
    ]);

    expect(getToolTaskSupport('server', 'slow')).toBe('required');
    expect(getToolTaskSupport('server', 'maybe')).toBe('optional');
    expect(getToolTaskSupport('server', 'never')).toBeUndefined();
    expect(getToolTaskSupport('server', 'plain')).toBeUndefined();
  });

  test('re-recording drops tools the server no longer reports', () => {
    recordToolTaskSupport('server', [tool('gone', 'required'), tool('stays', 'required')]);
    recordToolTaskSupport('server', [tool('stays', 'required')]);

    expect(getToolTaskSupport('server', 'gone')).toBeUndefined();
    expect(getToolTaskSupport('server', 'stays')).toBe('required');
  });

  test('is scoped per server', () => {
    recordToolTaskSupport('server', [tool('shared', 'required')]);
    expect(getToolTaskSupport('other', 'shared')).toBeUndefined();
  });

  test('clearing forgets the server', () => {
    recordToolTaskSupport('server', [tool('slow', 'required')]);
    clearToolTaskSupport('server');
    expect(getToolTaskSupport('server', 'slow')).toBeUndefined();
  });
});
