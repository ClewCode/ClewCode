import { describe, expect, it } from 'bun:test';
import {
  findActualString,
  LEFT_DOUBLE_CURLY_QUOTE,
  LEFT_SINGLE_CURLY_QUOTE,
  normalizeQuotes,
  preserveQuoteStyle,
  RIGHT_DOUBLE_CURLY_QUOTE,
  RIGHT_SINGLE_CURLY_QUOTE,
  stripTrailingWhitespace,
} from './utils.js';

describe('FileEditTool quote normalization', () => {
  it('converts single and double curly quotes to straight quotes', () => {
    const text = `${LEFT_SINGLE_CURLY_QUOTE}hello${RIGHT_SINGLE_CURLY_QUOTE} and ${LEFT_DOUBLE_CURLY_QUOTE}world${RIGHT_DOUBLE_CURLY_QUOTE}`;
    expect(normalizeQuotes(text)).toBe('\'hello\' and "world"');
  });

  it('leaves standard straight quotes unchanged', () => {
    const text = 'const msg = \'hello "world"\';';
    expect(normalizeQuotes(text)).toBe(text);
  });
});

describe('FileEditTool stripTrailingWhitespace', () => {
  it('strips trailing spaces while preserving LF line endings', () => {
    const input = 'const x = 1;   \nconst y = 2; \n';
    const expected = 'const x = 1;\nconst y = 2;\n';
    expect(stripTrailingWhitespace(input)).toBe(expected);
  });

  it('strips trailing spaces while preserving CRLF line endings', () => {
    const input = 'const a = 10;   \r\nconst b = 20;  \r\n';
    const expected = 'const a = 10;\r\nconst b = 20;\r\n';
    expect(stripTrailingWhitespace(input)).toBe(expected);
  });
});

describe('FileEditTool findActualString', () => {
  it('finds exact match in content', () => {
    const content = 'function add(a, b) {\n  return a + b;\n}';
    const search = 'return a + b;';
    expect(findActualString(content, search)).toBe(search);
  });

  it('finds string with curly quotes when searching with straight quotes', () => {
    const content = `const greeting = ${LEFT_DOUBLE_CURLY_QUOTE}Hello${RIGHT_DOUBLE_CURLY_QUOTE};`;
    const search = 'const greeting = "Hello";';
    const matched = findActualString(content, search);
    expect(matched).toBe(content);
  });

  it('returns null when search string is not found', () => {
    const content = 'const x = 1;';
    const search = 'const y = 2;';
    expect(findActualString(content, search)).toBeNull();
  });
});

describe('FileEditTool preserveQuoteStyle', () => {
  it('applies curly double quotes to replacement when file uses curly double quotes', () => {
    const search = 'const msg = "hello";';
    const actualOld = `const msg = ${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE};`;
    const replacement = 'const msg = "world";';
    const expected = `const msg = ${LEFT_DOUBLE_CURLY_QUOTE}world${RIGHT_DOUBLE_CURLY_QUOTE};`;
    expect(preserveQuoteStyle(search, actualOld, replacement)).toBe(expected);
  });

  it('applies curly single quotes to replacement when file uses curly single quotes', () => {
    const search = "const msg = 'hello';";
    const actualOld = `const msg = ${LEFT_SINGLE_CURLY_QUOTE}hello${RIGHT_SINGLE_CURLY_QUOTE};`;
    const replacement = "const msg = 'world';";
    const expected = `const msg = ${LEFT_SINGLE_CURLY_QUOTE}world${RIGHT_SINGLE_CURLY_QUOTE};`;
    expect(preserveQuoteStyle(search, actualOld, replacement)).toBe(expected);
  });

  it('returns replacement unchanged when no curly quotes were present in actualOld', () => {
    const search = 'const msg = "hello";';
    const actualOld = 'const msg = "hello";';
    const replacement = 'const msg = "world";';
    expect(preserveQuoteStyle(search, actualOld, replacement)).toBe(replacement);
  });
});
