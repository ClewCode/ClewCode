import { describe, expect, test } from 'bun:test';
import { ReadArtifactTool } from './ReadArtifactTool.js';

describe('ReadArtifactTool input', () => {
  test('has inputSchema', () => {
    expect(ReadArtifactTool.inputSchema).toBeDefined();
    expect(typeof ReadArtifactTool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof ReadArtifactTool.name).toBe('string');
  });
});
