import { describe, expect, it } from 'bun:test';
import { call } from './compact.js';

describe('/compact slash command', () => {
  it('throws when there are no messages to compact', async () => {
    const context: any = {
      messages: [],
      abortController: new AbortController(),
      options: { mainLoopModel: 'claude-3-5-sonnet' },
    };

    expect(call('', context)).rejects.toThrow('No messages to compact');
  });
});
