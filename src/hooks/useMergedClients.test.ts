import { describe, expect, test } from 'bun:test';
import type { MCPServerConnection } from '../services/mcp/types.js';
import { mergeClients } from './useMergedClients.js';

function client(name: string, marker: string): MCPServerConnection {
  return { name, marker } as unknown as MCPServerConnection;
}

describe('mergeClients', () => {
  test('keeps live clients when there are no startup clients', () => {
    const live = client('ide', 'live');
    expect(mergeClients(undefined, [live])).toEqual([live]);
  });

  test('live reconnect replaces a startup client with the same name', () => {
    const startup = client('ide', 'startup');
    const live = client('ide', 'live');
    expect(mergeClients([startup], [live])).toEqual([live]);
  });

  test('preserves startup ordering and appends newly discovered live clients', () => {
    const a = client('a', 'startup');
    const b = client('b', 'startup');
    const bLive = client('b', 'live');
    const c = client('c', 'live');
    expect(mergeClients([a, b], [bLive, c])).toEqual([a, bLive, c]);
  });
});
