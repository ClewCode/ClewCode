import { describe, expect, test } from 'bun:test';
import type { Tokens } from 'marked';
import { formatToken } from './markdown.js';

describe('formatToken inline code', () => {
  test('inherits parent styling without adding ANSI color or reset sequences', () => {
    const token = { type: 'codespan', raw: '`src/main.tsx`', text: 'src/main.tsx' } as Tokens.Codespan;
    expect(formatToken(token, 'dark')).toBe('src/main.tsx');
  });
});
