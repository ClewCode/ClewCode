import { describe, expect, test } from 'bun:test';
import { inputSchema } from './NotebookEditTool.js';

describe('NotebookEditTool input', () => {
  test('accepts notebook_path', () => {
    expect(
      inputSchema().safeParse({
        notebook_path: '/tmp/test.ipynb',
        cell_id: 'abc',
        new_source: 'print(1)',
      }).success,
    ).toBe(true);
  });
  test('rejects missing notebook_path', () => {
    expect(inputSchema().safeParse({} as any).success).toBe(false);
  });
});
