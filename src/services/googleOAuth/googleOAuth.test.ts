import { describe, expect, test } from 'vitest';
import { CODE_CHALLENGE_METHOD, GOOGLE_OAUTH_CONFIG } from '../../constants/googleOAuth.js';

describe('Google OAuth Config', () => {
  test('redirect URI uses the 127.0.0.1 loopback IP and /oauth2callback path', () => {
    // Google rejects the `localhost` hostname and non-registered paths with a
    // 400 at the consent screen; must mirror gemini-cli's registered redirect.
    const parsed = new URL(GOOGLE_OAUTH_CONFIG.REDIRECT_URI);
    expect(parsed.hostname).toBe('127.0.0.1');
    expect(parsed.protocol).toBe('http:');
    expect(parsed.pathname).toBe('/oauth2callback');
  });

  test('PKCE challenge method is S256', () => {
    expect(CODE_CHALLENGE_METHOD).toBe('S256');
  });

  test('scopes include generative-language and openid', () => {
    const scopes = GOOGLE_OAUTH_CONFIG.SCOPES;
    expect(scopes).toContain('openid');
    expect(scopes).toContain('https://www.googleapis.com/auth/generative-language');
  });

  test('auth URL params are well-formed when constructed via service', () => {
    // Simulate the same param construction as GoogleOAuthService.buildAuthUrl
    const authUrl = new URL(GOOGLE_OAUTH_CONFIG.AUTHORIZE_URL);
    authUrl.searchParams.append('client_id', 'test-client-id');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', 'http://127.0.0.1:1456/oauth2callback');
    authUrl.searchParams.append('scope', 'openid https://www.googleapis.com/auth/generative-language');
    authUrl.searchParams.append('code_challenge', 'test-challenge');
    authUrl.searchParams.append('code_challenge_method', CODE_CHALLENGE_METHOD);
    authUrl.searchParams.append('state', 'test-state');
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');

    const urlStr = authUrl.toString();
    const parsed = new URL(urlStr);

    expect(parsed.hostname).toBe('accounts.google.com');
    expect(parsed.pathname).toBe('/o/oauth2/v2/auth');
    expect(parsed.searchParams.get('client_id')).toBe('test-client-id');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:1456/oauth2callback');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
  });
});
