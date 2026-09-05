/**
 * isLocalhostUrl must classify by hostname, not by substring — otherwise
 * `http://localhost.attacker.example` would be treated as local (plain ws,
 * v2 path, HTTP allowed) and downgrade transport security.
 */

import { describe, expect, test } from 'bun:test';
import { buildSdkUrl, isLocalhostUrl } from './workSecret.js';

describe('isLocalhostUrl', () => {
  test('accepts true loopbacks', () => {
    expect(isLocalhostUrl('http://localhost:8080')).toBe(true);
    expect(isLocalhostUrl('http://LOCALHOST/')).toBe(true);
    expect(isLocalhostUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalhostUrl('http://127.0.0.5/')).toBe(true);
    expect(isLocalhostUrl('http://[::1]:8080/')).toBe(true);
  });

  test('rejects lookalike hostnames', () => {
    expect(isLocalhostUrl('http://localhost.attacker.example')).toBe(false);
    expect(isLocalhostUrl('http://evil-localhost.example')).toBe(false);
    expect(isLocalhostUrl('http://127.0.0.1.attacker.example/')).toBe(false);
    expect(isLocalhostUrl('https://api.example.com')).toBe(false);
    expect(isLocalhostUrl('not a url')).toBe(false);
  });

  test('lookalike host keeps secure transport in buildSdkUrl', () => {
    const url = buildSdkUrl('http://localhost.attacker.example', 's1');
    expect(url.startsWith('wss://')).toBe(true);
    expect(url).toContain('/v1/');
  });
});
