import { describe, expect, test } from 'bun:test';

const { validateURL, isPermittedRedirect } = await import('./utils.js');

describe('validateURL', () => {
  test('accepts valid public HTTPS URLs', () => {
    expect(validateURL('https://example.com/page')).toBe(true);
    expect(validateURL('https://docs.python.org/3/index.html')).toBe(true);
  });

  test('rejects URLs that are too long (>2000 chars)', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2001);
    expect(validateURL(longUrl)).toBe(false);
  });

  test('rejects URLs with embedded credentials', () => {
    expect(validateURL('https://user:pass@example.com')).toBe(false);
  });

  test('rejects bare IP literals (SSRF protection)', () => {
    // Cloud metadata endpoint — the critical SSRF target
    expect(validateURL('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(validateURL('https://169.254.169.254/')).toBe(false);
    // Loopback
    expect(validateURL('http://127.0.0.1/')).toBe(false);
    expect(validateURL('http://127.0.0.1:8080/')).toBe(false);
    // Private ranges
    expect(validateURL('http://10.0.0.1/')).toBe(false);
    expect(validateURL('http://172.16.0.1/')).toBe(false);
    expect(validateURL('http://192.168.1.1/')).toBe(false);
    // 0.0.0.0
    expect(validateURL('http://0.0.0.0/')).toBe(false);
  });

  test('rejects localhost', () => {
    expect(validateURL('http://localhost/')).toBe(false);
    expect(validateURL('http://localhost:3000/')).toBe(false);
    expect(validateURL('https://dev.localhost/')).toBe(false);
  });

  test('rejects single-label hostnames (no dot)', () => {
    expect(validateURL('http://intranet/')).toBe(false);
    expect(validateURL('http://host/')).toBe(false);
  });

  test('rejects invalid URLs', () => {
    expect(validateURL('not-a-url')).toBe(false);
    expect(validateURL('')).toBe(false);
  });

  test('accepts valid HTTP URLs (upgraded to HTTPS at request time)', () => {
    expect(validateURL('http://example.com/page')).toBe(true);
  });
});

describe('isPermittedRedirect', () => {
  test('allows same host with path change', () => {
    expect(isPermittedRedirect('https://example.com/a', 'https://example.com/b')).toBe(true);
  });

  test('allows www add/remove', () => {
    expect(isPermittedRedirect('https://example.com/page', 'https://www.example.com/page')).toBe(true);
    expect(isPermittedRedirect('https://www.example.com/page', 'https://example.com/page')).toBe(true);
  });

  test('preserves query params when same host', () => {
    expect(isPermittedRedirect('https://example.com/search?q=hello', 'https://example.com/search?q=world')).toBe(true);
  });

  test('blocks cross-origin redirects', () => {
    expect(isPermittedRedirect('https://example.com/page', 'https://evil.com/page')).toBe(false);
  });

  test('blocks protocol downgrade', () => {
    expect(isPermittedRedirect('https://example.com/page', 'http://example.com/page')).toBe(false);
  });

  test('blocks port changes', () => {
    expect(isPermittedRedirect('https://example.com/page', 'https://example.com:8080/page')).toBe(false);
  });

  test('blocks redirects with embedded credentials', () => {
    expect(isPermittedRedirect('https://example.com/page', 'https://user:pass@example.com/page')).toBe(false);
  });

  test('blocks SSRF redirect to private IP', () => {
    expect(isPermittedRedirect('https://example.com/page', 'http://169.254.169.254/')).toBe(false);
  });
});
