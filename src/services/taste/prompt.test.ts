import { describe, expect, test } from 'bun:test';
import { buildTastePromptSection, parseTasteBlock } from './prompt.js';

describe('parseTasteBlock', () => {
  test('reads scope, confidence, category, and text', () => {
    const text = ['Saved 2 memories.', '', '```taste', 'global|cli|0.8|Communicates in Thai', '```'].join('\n');
    expect(parseTasteBlock(text)).toEqual([
      { scope: 'global', category: 'cli', confidence: 0.8, text: 'Communicates in Thai' },
    ]);
  });

  test('defaults category to general for the old 3-field format', () => {
    const text = ['```taste', 'global|0.8|Communicates in Thai', '```'].join('\n');
    expect(parseTasteBlock(text)).toEqual([
      { scope: 'global', category: 'general', confidence: 0.8, text: 'Communicates in Thai' },
    ]);
  });

  test('returns nothing when there is no block — the normal case', () => {
    expect(parseTasteBlock('Saved 1 memory. Nothing else to report.')).toEqual([]);
  });

  test('keeps a preference that contains a pipe', () => {
    const text = '```taste\nglobal|typescript|0.7|Prefers `a | b` over concat\n```';
    expect(parseTasteBlock(text)[0]?.text).toBe('Prefers `a | b` over concat');
  });

  test('drops malformed lines rather than guessing', () => {
    const text = [
      '```taste',
      'sideways|0.8|Bad scope',
      'global|nope|Bad category',
      'global|cli|1.5|Out of range',
      'global|cli|0|Zero confidence',
      'global|cli|0.8|',
      'missing fields',
      'global|cli|0.9|Good one',
      '```',
    ].join('\n');
    expect(parseTasteBlock(text)).toEqual([{ scope: 'global', category: 'cli', confidence: 0.9, text: 'Good one' }]);
  });

  test('reads every block when the agent emits more than one', () => {
    const text = '```taste\nglobal|cli|0.8|One\n```\ntext\n```taste\nproject|typescript|0.6|Two\n```';
    expect(parseTasteBlock(text).map(c => c.text)).toEqual(['One', 'Two']);
  });
});

describe('buildTastePromptSection', () => {
  test('lists known taste so the agent does not repeat it', () => {
    const section = buildTastePromptSection(['Communicates in Thai']).join('\n');
    expect(section).toContain('Already known');
    expect(section).toContain('- Communicates in Thai');
  });

  test('says so explicitly when nothing is known yet', () => {
    expect(buildTastePromptSection([]).join('\n')).toContain('Nothing has been learned yet.');
  });
});
