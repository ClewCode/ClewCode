import { describe, expect, test } from 'bun:test';
import { getCollapsedThinkingPreview, hasThinkingBufferContent } from './AssistantThinkingMessage.js';

describe('hasThinkingBufferContent', () => {
  test('hides an empty streaming thinking placeholder', () => {
    expect(hasThinkingBufferContent('')).toBe(false);
    expect(hasThinkingBufferContent('  \n\t')).toBe(false);
  });

  test('shows the thinking buffer after the first summary content arrives', () => {
    expect(hasThinkingBufferContent('Inspecting the repository')).toBe(true);
  });
});

describe('getCollapsedThinkingPreview', () => {
  test('hides a completed short thinking block instead of leaving a label-only row', () => {
    expect(getCollapsedThinkingPreview('Checking the diff.')).toBeNull();
  });

  test('keeps a useful preview for substantial thinking content', () => {
    const thinking = 'a'.repeat(150);
    expect(getCollapsedThinkingPreview(thinking)).toBe(thinking);
  });
});
