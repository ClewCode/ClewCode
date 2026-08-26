import { describe, expect, it } from 'bun:test';
import { hasBinaryExtension } from '../../constants/files.js';
import { isPDFExtension, parsePDFPageRange } from '../../utils/pdfUtils.js';
import { DEFAULT_MAX_OUTPUT_TOKENS, getDefaultFileReadingLimits } from './limits.js';
import { LINE_FORMAT_INSTRUCTION, OFFSET_INSTRUCTION_DEFAULT, renderPromptTemplate } from './prompt.js';

describe('FileReadTool limits', () => {
  it('returns valid default reading limits', () => {
    const limits = getDefaultFileReadingLimits();
    expect(limits.maxTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(limits.maxSizeBytes).toBeGreaterThan(0);
  });
});

describe('FileReadTool prompt rendering', () => {
  it('renders prompt template with provided instructions', () => {
    const prompt = renderPromptTemplate(
      LINE_FORMAT_INSTRUCTION,
      ' (custom size limit: 512KB)',
      OFFSET_INSTRUCTION_DEFAULT,
    );
    expect(prompt).toContain('Reads a file from the local filesystem');
    expect(prompt).toContain('512KB');
    expect(prompt).toContain('line numbers');
  });
});

describe('FileReadTool file type and extension detection', () => {
  it('identifies binary file extensions', () => {
    expect(hasBinaryExtension('image.png')).toBe(true);
    expect(hasBinaryExtension('archive.zip')).toBe(true);
    expect(hasBinaryExtension('binary.exe')).toBe(true);
    expect(hasBinaryExtension('source.ts')).toBe(false);
    expect(hasBinaryExtension('readme.md')).toBe(false);
  });

  it('identifies PDF extensions', () => {
    expect(isPDFExtension('pdf')).toBe(true);
    expect(isPDFExtension('.pdf')).toBe(true);
    expect(isPDFExtension('.PDF')).toBe(true);
    expect(isPDFExtension('txt')).toBe(false);
  });

  it('parses PDF page ranges correctly', () => {
    expect(parsePDFPageRange('1-5')).toEqual({ firstPage: 1, lastPage: 5 });
    expect(parsePDFPageRange('3')).toEqual({ firstPage: 3, lastPage: 3 });
    expect(parsePDFPageRange('5-')).toEqual({ firstPage: 5, lastPage: Infinity });
    expect(parsePDFPageRange('')).toBeNull();
    expect(parsePDFPageRange('invalid')).toBeNull();
  });
});
