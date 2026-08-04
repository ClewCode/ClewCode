import { describe, expect, test } from 'bun:test';
import {
  appendTaste,
  formatTasteEntry,
  lintTasteContent,
  parseTasteFile,
  pushTaste,
  readAllTaste,
  readTaste,
  removeTaste,
} from './store.js';

describe('parseTasteFile', () => {
  test('reads date, confidence, and defaults category to general', () => {
    const [entry] = parseTasteFile('- [2026-08-04] (80%) Communicates in Thai for brief messages', 'global');
    expect(entry).toMatchObject({
      scope: 'global',
      category: 'general',
      date: '2026-08-04',
      confidence: 0.8,
      text: 'Communicates in Thai for brief messages',
    });
  });

  test('reads an explicit category bracket', () => {
    const [entry] = parseTasteFile('- [2026-08-04] (80%) [cli] Uses const instead of let', 'project');
    expect(entry).toMatchObject({
      scope: 'project',
      category: 'cli',
      date: '2026-08-04',
      confidence: 0.8,
      text: 'Uses const instead of let',
    });
  });

  test('a hand-written line with no marker reads as certain', () => {
    const [entry] = parseTasteFile('- [2026-08-04] Prefers terse answers', 'project');
    expect(entry?.confidence).toBe(1);
    expect(entry?.text).toBe('Prefers terse answers');
    expect(entry?.category).toBe('general');
  });

  test('skips headers and prose', () => {
    const entries = parseTasteFile('# Coding Style & Preferences\n\nSome intro line.\n- [2026-08-04] Real', 'global');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toBe('Real');
  });

  test('ignores undated bullets — the repo scan writes docs into this file', () => {
    // Real content found in ~/.clew/memory/TASTE.md. Read as entries, these
    // become standing instructions injected on every turn.
    const scanOutput = [
      '# Coding Style & Preferences',
      'Auto-detected from repo scan.',
      '## Language',
      '- JavaScript',
      '## Quality',
      '- Tests: not detected',
      '- [2026-08-04] Prefers terse answers',
    ].join('\n');
    expect(parseTasteFile(scanOutput, 'global').map(e => e.text)).toEqual(['Prefers terse answers']);
  });

  test('clamps an out-of-range confidence rather than trusting it', () => {
    const [entry] = parseTasteFile('- [2026-08-04] (250%) Overconfident', 'global');
    expect(entry?.confidence).toBe(1);
  });

  test('ids are scope + category + text so the same text in two categories stays distinct', () => {
    const [g] = parseTasteFile('- [2026-08-04] Same text', 'global');
    const [p] = parseTasteFile('- [2026-08-04] [cli] Same text', 'project');
    expect(g?.id).not.toBe(p?.id);
  });
});

describe('formatTasteEntry', () => {
  test('round-trips through the parser', () => {
    const line = formatTasteEntry({
      date: '2026-08-04',
      confidence: 0.8,
      category: 'general',
      text: 'Wants terse answers',
    });
    expect(line).toBe('- [2026-08-04] (80%) Wants terse answers');
    expect(parseTasteFile(line, 'global')[0]).toMatchObject({ confidence: 0.8, text: 'Wants terse answers' });
  });

  test('omits the marker at full confidence so confirmed entries read as plain prose', () => {
    expect(
      formatTasteEntry({ date: '2026-08-04', confidence: 1, category: 'general', text: 'Wants terse answers' }),
    ).toBe('- [2026-08-04] Wants terse answers');
  });

  test('includes the category bracket for non-general categories', () => {
    expect(
      formatTasteEntry({ date: '2026-08-04', confidence: 0.8, category: 'cli', text: 'Uses const instead of let' }),
    ).toBe('- [2026-08-04] (80%) [cli] Uses const instead of let');
  });
});

describe('lintTasteContent', () => {
  test('reports no errors for a clean file', () => {
    const content = [
      '# Coding Style & Preferences',
      '',
      '- [2026-08-04] (80%) Communicates in Thai',
      '- [2026-08-04] (60%) [cli] Prefers Commander.js',
      '- [2026-08-04] Hand-written entry',
    ].join('\n');
    expect(lintTasteContent(content)).toEqual([]);
  });

  test('flags non-entry lines that are not headers', () => {
    const content = ['This is a stray line', '- [2026-08-04] Valid'].join('\n');
    const errors = lintTasteContent(content);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(1);
    expect(errors[0]?.message).toBe('Not a valid entry line');
  });

  test('flags unknown categories', () => {
    const content = '- [2026-08-04] (80%) [python] Uses snake_case';
    const errors = lintTasteContent(content);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('python');
  });

  test('flags out-of-range confidence', () => {
    const content = '- [2026-08-04] (150%) Overconfident';
    const errors = lintTasteContent(content);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('out of range');
  });
});

describe('pushTaste', () => {
  test('copies entries from project to global, skipping duplicates', async () => {
    // Seed both scopes with one known entry so we can verify dedup on a second push.
    // We use a test-only entry in the 'general' category that is unlikely to
    // collide with real data.
    const testText = 'TestPreference_UNIQUE_001';
    const marker = '- [2026-08-04] (85%) [cli] TestPreference_UNIQUE_001';

    const cleanup = async () => {
      // Remove our test entry from both scopes
      for (const scope of ['project', 'global'] as const) {
        const entries = await readTaste(scope);
        if (entries.some(e => e.text.includes(testText))) {
          for (const e of entries.filter(x => x.text.includes(testText))) {
            await removeTaste(scope, e.text, e.category);
          }
        }
      }
    };

    // Clean up any pre-existing test data first
    await cleanup();

    // Write the test entry to project scope only
    await appendTaste('project', [{ text: testText, confidence: 0.85, category: 'cli' }]);

    // Push project → global
    const copied = await pushTaste('project', 'global', 'cli');
    expect(copied).toHaveLength(1);
    expect(copied[0]?.text).toBe(testText);
    expect(copied[0]?.category).toBe('cli');

    // Verify it landed in global scope
    const globalEntries = await readAllTaste();
    const found = globalEntries.find(e => e.text.includes(testText) && e.scope === 'global');
    expect(found).toBeDefined();

    // Pushing again should copy nothing (dedup)
    const secondPush = await pushTaste('project', 'global', 'cli');
    expect(secondPush).toHaveLength(0);

    // Clean up
    await cleanup();
  });

  test('returns empty array when source and target are the same', async () => {
    const result = await pushTaste('project', 'project');
    expect(result).toEqual([]);
  });
});
