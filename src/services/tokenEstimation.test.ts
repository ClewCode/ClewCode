import { describe, expect, it } from 'bun:test';
import {
  bytesPerTokenForFileType,
  roughTokenCountEstimation,
  roughTokenCountEstimationForBlock,
  roughTokenCountEstimationForFileType,
} from './tokenEstimation.js';

describe('Token Estimation Utilities', () => {
  it('calculates rough token count for text strings', () => {
    // 4 chars per token by default
    expect(roughTokenCountEstimation('1234')).toBe(1);
    expect(roughTokenCountEstimation('12345678')).toBe(2);
    expect(roughTokenCountEstimation('')).toBe(0);
  });

  it('adjusts bytes-per-token ratio based on file type', () => {
    expect(bytesPerTokenForFileType('json')).toBe(2);
    expect(bytesPerTokenForFileType('jsonl')).toBe(2);
    expect(bytesPerTokenForFileType('ts')).toBe(4);
    expect(bytesPerTokenForFileType('md')).toBe(4);

    const jsonString = '{"key":"value"}'; // 15 chars
    // For json (ratio 2): 15 / 2 = 8 tokens
    expect(roughTokenCountEstimationForFileType(jsonString, 'json')).toBe(8);
    // For ts (ratio 4): 15 / 4 = 4 tokens
    expect(roughTokenCountEstimationForFileType(jsonString, 'ts')).toBe(4);
  });

  it('estimates tokens for various message block types', () => {
    // Text block
    expect(roughTokenCountEstimationForBlock({ type: 'text', text: 'hello world!' })).toBe(3);

    // Image block (fixed conservative constant of 2000 tokens)
    expect(
      roughTokenCountEstimationForBlock({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'abc' },
      }),
    ).toBe(2000);

    // Document block (fixed conservative constant of 2000 tokens)
    expect(
      roughTokenCountEstimationForBlock({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: 'abc' },
      } as any),
    ).toBe(2000);

    // Tool use block
    expect(
      roughTokenCountEstimationForBlock({
        type: 'tool_use',
        id: '1',
        name: 'Bash',
        input: { command: 'ls -la' },
      }),
    ).toBeGreaterThan(0);
  });
});
