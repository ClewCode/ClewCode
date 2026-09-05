import { describe, expect, test } from 'bun:test';
import { normalizeGatewayBaseUrl } from './gatewayUrl.js';

describe('normalizeGatewayBaseUrl', () => {
  test('uses the production gateway host by default', () => {
    expect(normalizeGatewayBaseUrl()).toBe('https://api.clew-code.org');
  });

  test('accepts configured URLs with or without the v1 prefix', () => {
    expect(normalizeGatewayBaseUrl('https://gateway.example')).toBe('https://gateway.example');
    expect(normalizeGatewayBaseUrl('https://gateway.example/v1')).toBe('https://gateway.example');
    expect(normalizeGatewayBaseUrl('https://gateway.example/v1/')).toBe('https://gateway.example');
  });
});
