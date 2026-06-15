import { describe, expect, test } from 'bun:test';
import { stripLeadingBlankLines } from './AssistantTextMessage.js';

describe('stripLeadingBlankLines', () => {
  test('removes blank lines before the first visible markdown content', () => {
    expect(stripLeadingBlankLines('\n\nHello\nworld')).toBe('Hello\nworld');
  });

  test('keeps content that already starts on the first line', () => {
    expect(stripLeadingBlankLines('Hello\n\nworld')).toBe('Hello\n\nworld');
  });
});
