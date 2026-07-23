import { describe, expect, test } from 'vitest';
import { GOOGLE_OAUTH_CONFIG } from './googleOAuth.js';

describe('GOOGLE_OAUTH_CONFIG', () => {
  test('REDIRECT_URI uses 127.0.0.1 loopback (not localhost)', () => {
    const uri = GOOGLE_OAUTH_CONFIG.REDIRECT_URI;
    const parsed = new URL(uri);
    expect(parsed.hostname).toBe('127.0.0.1');
    expect(parsed.pathname).toBe('/oauth2callback');
    expect(parsed.protocol).toBe('http:');
    expect(Number.isInteger(parsed.port ? Number(parsed.port) : 0)).toBe(true);
  });

  test('AUTHORIZE_URL is Google OAuth endpoint', () => {
    expect(GOOGLE_OAUTH_CONFIG.AUTHORIZE_URL).toBe('https://accounts.google.com/o/oauth2/auth');
  });

  test('TOKEN_URL is Google token endpoint', () => {
    expect(GOOGLE_OAUTH_CONFIG.TOKEN_URL).toBe('https://oauth2.googleapis.com/token');
  });

  test('SCOPES includes generative-language for API access', () => {
    expect(GOOGLE_OAUTH_CONFIG.SCOPES).toContain('https://www.googleapis.com/auth/generative-language');
  });
});
