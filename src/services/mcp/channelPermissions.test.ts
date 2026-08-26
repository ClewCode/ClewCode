import { describe, expect, it } from 'bun:test';
import {
  createChannelPermissionCallbacks,
  filterPermissionRelayClients,
  PERMISSION_REPLY_RE,
  shortRequestId,
  truncateForPreview,
} from './channelPermissions.js';

describe('channelPermissions PERMISSION_REPLY_RE regex', () => {
  it('matches valid approval and rejection replies', () => {
    expect(PERMISSION_REPLY_RE.test('yes abcde')).toBe(true);
    expect(PERMISSION_REPLY_RE.test('y abcde')).toBe(true);
    expect(PERMISSION_REPLY_RE.test('no abcde')).toBe(true);
    expect(PERMISSION_REPLY_RE.test('n abcde')).toBe(true);
    expect(PERMISSION_REPLY_RE.test('  YES   xyzab  ')).toBe(true);
    expect(PERMISSION_REPLY_RE.test('No tbxkq')).toBe(true);
  });

  it('rejects invalid reply formats', () => {
    expect(PERMISSION_REPLY_RE.test('yes')).toBe(false);
    expect(PERMISSION_REPLY_RE.test('no')).toBe(false);
    expect(PERMISSION_REPLY_RE.test('yes please')).toBe(false);
    expect(PERMISSION_REPLY_RE.test('yes toolu_0192837465')).toBe(false);
    expect(PERMISSION_REPLY_RE.test('yes abc')).toBe(false); // only 3 chars
    expect(PERMISSION_REPLY_RE.test('yes abcdef')).toBe(false); // 6 chars
    expect(PERMISSION_REPLY_RE.test('hello yes abcde')).toBe(false);
  });
});

describe('shortRequestId', () => {
  it('generates 5-letter lowercase IDs without "l"', () => {
    const ids = ['toolu_1234567890', 'toolu_abcdefghij', 'toolu_xyz987654321'].map(shortRequestId);

    for (const id of ids) {
      expect(id).toHaveLength(5);
      expect(id).toMatch(/^[a-km-z]{5}$/);
      expect(id).not.toContain('l');
    }
  });

  it('is deterministic for the same toolUseID', () => {
    const id1 = shortRequestId('toolu_0123456789abcdef');
    const id2 = shortRequestId('toolu_0123456789abcdef');
    expect(id1).toBe(id2);
  });
});

describe('truncateForPreview', () => {
  it('returns compact JSON preview for small objects', () => {
    expect(truncateForPreview({ command: 'ls -la' })).toBe('{"command":"ls -la"}');
  });

  it('truncates long content to 200 chars with ellipsis', () => {
    const longInput = { file_content: 'a'.repeat(300) };
    const preview = truncateForPreview(longInput);
    expect(preview.length).toBeLessThanOrEqual(205);
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('filterPermissionRelayClients', () => {
  it('only returns connected clients in allowlist declaring both experimental capabilities', () => {
    const clients = [
      {
        type: 'connected',
        name: 'telegram',
        capabilities: {
          experimental: {
            'claude/channel': {},
            'claude/channel/permission': {},
          },
        },
      },
      {
        type: 'connected',
        name: 'discord',
        capabilities: {
          experimental: {
            'claude/channel': {},
            // Missing claude/channel/permission
          },
        },
      },
      {
        type: 'disconnected',
        name: 'telegram',
        capabilities: {
          experimental: {
            'claude/channel': {},
            'claude/channel/permission': {},
          },
        },
      },
      {
        type: 'connected',
        name: 'slack-unauthorized',
        capabilities: {
          experimental: {
            'claude/channel': {},
            'claude/channel/permission': {},
          },
        },
      },
    ];

    const allowlist = new Set(['telegram', 'discord']);
    const filtered = filterPermissionRelayClients(clients, name => allowlist.has(name));

    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('telegram');
  });
});

describe('createChannelPermissionCallbacks', () => {
  it('registers and resolves pending permission requests', () => {
    const callbacks = createChannelPermissionCallbacks();

    let resolvedResponse: any = null;
    const unsubscribe = callbacks.onResponse('abcde', resp => {
      resolvedResponse = resp;
    });

    const handled = callbacks.resolve('ABCDE', 'allow', 'plugin:telegram:tg');
    expect(handled).toBe(true);
    expect(resolvedResponse).toEqual({
      behavior: 'allow',
      fromServer: 'plugin:telegram:tg',
    });

    // Secondary resolve should return false (already resolved / deleted)
    expect(callbacks.resolve('abcde', 'deny', 'plugin:telegram:tg')).toBe(false);

    unsubscribe();
  });

  it('handles unsubscribing before resolution', () => {
    const callbacks = createChannelPermissionCallbacks();

    let called = false;
    const unsubscribe = callbacks.onResponse('xyzab', () => {
      called = true;
    });

    unsubscribe();

    const handled = callbacks.resolve('xyzab', 'allow', 'plugin:discord:bot');
    expect(handled).toBe(false);
    expect(called).toBe(false);
  });
});
