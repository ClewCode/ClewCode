import { describe, expect, it } from 'bun:test';
import { Cursor } from '../../utils/Cursor.js';

describe('PromptInput scroll indicator windowing', () => {
  it('calculates linesAbove and linesBelow correctly when text exceeds viewport', () => {
    // 10 lines of text
    const multilineText = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');
    const columns = 80;
    const maxVisibleLines = 4;

    // Cursor at line 0 (offset 0)
    const cursorTop = Cursor.fromText(multilineText, columns, 0);
    const startLineTop = cursorTop.getViewportStartLine(maxVisibleLines);
    const allLines = cursorTop.measuredText.getWrappedText();
    const endLineTop = Math.min(allLines.length, startLineTop + maxVisibleLines);

    expect(startLineTop).toBe(0);
    expect(allLines.length - endLineTop).toBe(6); // 6 lines below

    // Cursor at the bottom line
    const cursorBottom = Cursor.fromText(multilineText, columns, multilineText.length);
    const startLineBottom = cursorBottom.getViewportStartLine(maxVisibleLines);
    const endLineBottom = Math.min(allLines.length, startLineBottom + maxVisibleLines);

    expect(startLineBottom).toBeGreaterThan(0);
    expect(allLines.length - endLineBottom).toBe(0); // 0 lines below
  });

  it('formats indicator text properly with 1000+ capping', () => {
    function formatCount(count: number): string {
      return count > 1000 ? '1000+' : String(count);
    }

    expect(formatCount(1)).toBe('1');
    expect(formatCount(345)).toBe('345');
    expect(formatCount(1000)).toBe('1000');
    expect(formatCount(1001)).toBe('1000+');
    expect(formatCount(50000)).toBe('1000+');
  });
});
