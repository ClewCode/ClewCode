import { describe, expect, it } from 'bun:test';
import { stringWidth } from '../stringWidth.js';
import { wrapAnsi } from '../wrapAnsi.js';

describe('Unicode & Thai wrapAnsi', () => {
  it('wraps standard ASCII text without breaking words', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const wrapped = wrapAnsi(text, 20);

    for (const line of wrapped.split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(20);
    }
  });

  it('wraps Thai text without severing combining marks and vowel signs', () => {
    const thaiText =
      '❌ไม่มี - ได้ Repo Map (AST signatures ~1500 tokens) + codegraph (symbol graph) + grep แทน เป็น structural/exact search';
    const wrapped = wrapAnsi(thaiText, 40);

    const lines = wrapped.split('\n');
    expect(lines.length).toBeGreaterThan(1);

    for (const line of lines) {
      // Must strictly adhere to column width
      expect(stringWidth(line)).toBeLessThanOrEqual(40);

      // Must not start with orphan combining marks
      const firstChar = line.trim()[0];
      if (firstChar) {
        const cp = firstChar.codePointAt(0)!;
        // Thai combining marks should not start a line
        expect(cp === 0x0e31 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e)).toBe(false);
      }
    }
  });
});
