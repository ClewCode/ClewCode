import { describe, expect, it } from 'bun:test';
import {
  hasMalformedTokens,
  hasShellQuoteSingleQuoteBug,
  quote,
  tryParseShellCommand,
  tryQuoteShellArgs,
} from './shellQuote.js';

describe('shellQuote tryParseShellCommand', () => {
  it('parses simple commands into tokens', () => {
    const res = tryParseShellCommand('ls -la /tmp');
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.tokens).toEqual(['ls', '-la', '/tmp']);
    }
  });

  it('handles environment variable interpolation', () => {
    const res = tryParseShellCommand('echo $FOO', { FOO: 'bar' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.tokens).toEqual(['echo', 'bar']);
    }
  });
});

describe('shellQuote tryQuoteShellArgs & quote', () => {
  it('quotes arguments with spaces and special characters', () => {
    const res = tryQuoteShellArgs(['grep', 'hello world', 'file.txt']);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.quoted).toBe("grep 'hello world' file.txt");
    }
  });

  it('handles numbers and booleans', () => {
    const res = tryQuoteShellArgs(['node', 'script.js', 42, true]);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.quoted).toBe('node script.js 42 true');
    }
  });

  it('quote() converts arrays to safe shell quoted string', () => {
    expect(quote(['echo', 'hello'])).toBe('echo hello');
    expect(quote(['echo', 'hello world'])).toBe("echo 'hello world'");
  });
});

describe('shellQuote security checks', () => {
  it('detects malformed tokens with unbalanced brackets or quotes', () => {
    expect(hasMalformedTokens('echo "unclosed quote', ['echo', 'unclosed quote'])).toBe(true);
    expect(hasMalformedTokens('echo "closed quote"', ['echo', 'closed quote'])).toBe(false);
  });

  it('detects shell-quote single quote backslash bug patterns', () => {
    expect(hasShellQuoteSingleQuoteBug("echo 'test\\'")).toBe(true);
    expect(hasShellQuoteSingleQuoteBug("echo 'test'")).toBe(false);
  });
});
