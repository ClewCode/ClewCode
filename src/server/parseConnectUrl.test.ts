import { describe, expect, test } from 'bun:test';
import { parseConnectUrl } from './parseConnectUrl.js';

describe('parseConnectUrl', () => {
  test('parses host, port, and token', () => {
    expect(parseConnectUrl('cc://192.168.1.10:8080?token=abc')).toEqual({
      serverUrl: 'http://192.168.1.10:8080',
      authToken: 'abc',
    });
  });

  test('works without token and port', () => {
    expect(parseConnectUrl('cc://example.com')).toEqual({ serverUrl: 'http://example.com' });
  });

  test('honors tls=1 and keeps basepath', () => {
    expect(parseConnectUrl('cc://example.com/clew?token=t&tls=1')).toEqual({
      serverUrl: 'https://example.com/clew',
      authToken: 't',
    });
  });

  test('rejects garbage and hostless URLs', () => {
    expect(() => parseConnectUrl('not a url')).toThrow();
    expect(() => parseConnectUrl('cc://?token=t')).toThrow();
  });

  test('rejects cc+unix:// with a clear error', () => {
    expect(() => parseConnectUrl('cc+unix:///tmp/x.sock?token=t')).toThrow(/unix-socket/i);
  });
});
