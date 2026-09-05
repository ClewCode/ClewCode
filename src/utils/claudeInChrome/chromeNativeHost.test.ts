import { describe, expect, it } from 'bun:test';
import { encodeChromeMessage, runChromeNativeHost } from './chromeNativeHost.js';

describe('Chrome native host', () => {
  it('exports the CLI native-host entrypoint', () => {
    expect(typeof runChromeNativeHost).toBe('function');
  });

  it('frames UTF-8 JSON with a 4-byte little-endian length prefix', () => {
    const message = JSON.stringify({ type: 'ping', text: 'สวัสดี' });
    const frame = encodeChromeMessage(message);
    const payload = Buffer.from(message, 'utf8');

    expect(frame.readUInt32LE(0)).toBe(payload.length);
    expect(frame.subarray(4)).toEqual(payload);
  });
});
