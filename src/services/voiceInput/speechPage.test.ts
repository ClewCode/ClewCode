import { describe, expect, test } from 'bun:test';
import { speechPageHtml } from './speechPage.js';

describe('voice input page', () => {
  test('does not submit recognized speech before the user explicitly sends it', () => {
    const html = speechPageHtml('en-US');
    const calls = html.match(/sendResult\(transcript\.trim\(\)\)/g) ?? [];

    expect(html).toContain('Review then Send');
    expect(calls).toHaveLength(1);
    expect(html).toContain("status.textContent = 'Send failed'");
  });
});
