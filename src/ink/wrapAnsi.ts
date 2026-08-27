import wrapAnsiNpm from 'wrap-ansi';
import { stringWidth } from './stringWidth.js';

type WrapAnsiOptions = {
  hard?: boolean;
  wordWrap?: boolean;
  trim?: boolean;
};

const wrapAnsiBun = typeof Bun !== 'undefined' && typeof Bun.wrapAnsi === 'function' ? Bun.wrapAnsi : null;

let segmenterCache: Intl.Segmenter | null = null;
function getUnicodeSegmenter(): Intl.Segmenter {
  if (!segmenterCache) {
    segmenterCache = new Intl.Segmenter(undefined, { granularity: 'word' });
  }
  return segmenterCache;
}

function needsUnicodeSegmentationWrap(str: string): boolean {
  for (const char of str) {
    const cp = char.codePointAt(0)!;
    // Thai, Lao, Khmer, Myanmar, Indic scripts
    if (cp >= 0x0900 && cp <= 0x0eff) return true;
    if (cp >= 0x1000 && cp <= 0x109f) return true;
    if (cp >= 0x1780 && cp <= 0x17ff) return true;
  }
  return false;
}

/**
 * Word boundary wrapping for non-whitespace-delimited complex scripts (Thai/CJK/Indic)
 * using Intl.Segmenter to prevent severing combining marks and vowel signs.
 */
function wrapUnicodeComplex(input: string, columns: number, options?: WrapAnsiOptions): string {
  if (columns <= 0 || !input) return input;

  const lines = input.split('\n');
  const wrappedLines: string[] = [];
  const segmenter = getUnicodeSegmenter();

  for (const line of lines) {
    if (stringWidth(line) <= columns) {
      wrappedLines.push(line);
      continue;
    }

    const segments: string[] = [];
    for (const { segment } of segmenter.segment(line)) {
      segments.push(segment);
    }

    let currentLine = '';
    let currentWidth = 0;

    for (const seg of segments) {
      const segWidth = stringWidth(seg);

      if (currentWidth + segWidth <= columns) {
        currentLine += seg;
        currentWidth += segWidth;
      } else {
        if (currentLine.length === 0) {
          // Segment itself exceeds columns: chunk by characters
          let chunk = '';
          let chunkWidth = 0;
          for (const char of seg) {
            const charWidth = stringWidth(char);
            if (chunkWidth + charWidth > columns && chunk.length > 0) {
              wrappedLines.push(chunk);
              chunk = char;
              chunkWidth = charWidth;
            } else {
              chunk += char;
              chunkWidth += charWidth;
            }
          }
          if (chunk.length > 0) {
            currentLine = chunk;
            currentWidth = chunkWidth;
          }
        } else {
          wrappedLines.push(options?.trim !== false ? currentLine.trimEnd() : currentLine);
          const nextSeg = /^\s+$/.test(seg) ? '' : seg;
          currentLine = nextSeg;
          currentWidth = stringWidth(nextSeg);
        }
      }
    }

    if (currentLine.length > 0) {
      wrappedLines.push(options?.trim !== false ? currentLine.trimEnd() : currentLine);
    }
  }

  return wrappedLines.join('\n');
}

export const wrapAnsi: (input: string, columns: number, options?: WrapAnsiOptions) => string = (
  input,
  columns,
  options,
) => {
  if (needsUnicodeSegmentationWrap(input)) {
    return wrapUnicodeComplex(input, columns, options);
  }
  return wrapAnsiBun ? wrapAnsiBun(input, columns, options) : wrapAnsiNpm(input, columns, options);
};
