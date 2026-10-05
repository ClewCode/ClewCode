import { describe, expect, test } from 'bun:test';
import {
  getCollapsedThinkingPreview,
  getThinkingDisplayText,
  hasThinkingBufferContent,
} from './AssistantThinkingMessage.js';

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

describe('getThinkingDisplayText', () => {
  test('keeps only the latest activity lines while streaming', () => {
    expect(getThinkingDisplayText('one\ntwo\nthree\nfour\nfive')).toBe('… 1 earlier updates\ntwo\nthree\nfour\nfive');
  });

  test('does not alter short thinking buffers', () => {
    expect(getThinkingDisplayText('Inspecting the repository\nReading the file')).toBe(
      'Inspecting the repository\nReading the file',
    );
  });
});
