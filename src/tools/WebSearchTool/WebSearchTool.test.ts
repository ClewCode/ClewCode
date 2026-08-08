import { describe, expect, test } from 'bun:test';

const { WebSearchTool, effectiveQueries } = await import('./WebSearchTool.js');

describe('effectiveQueries', () => {
  test('uses queries array when provided', () => {
    expect(effectiveQueries({ queries: ['react benchmarks', 'vue benchmarks'] })).toEqual([
      'react benchmarks',
      'vue benchmarks',
    ]);
  });

  test('falls back to single query when queries is absent', () => {
    expect(effectiveQueries({ query: 'typescript' })).toEqual(['typescript']);
  });

  test('prefers queries over query when both are present', () => {
    expect(effectiveQueries({ query: 'single', queries: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  test('ignores an empty queries array', () => {
    expect(effectiveQueries({ query: 'single' })).toEqual(['single']);
  });

  test('returns empty array when neither is provided', () => {
    expect(effectiveQueries({})).toEqual([]);
  });
});

describe('WebSearchTool.mapToolResultToToolResultBlockParam', () => {
  test('formats results with snippets as markdown links', () => {
    const output = {
      query: 'latest typescript features',
      results: [
        {
          tool_use_id: 'search-1',
          content: [
            {
              title: 'TypeScript 5.6 Release Notes',
              url: 'https://example.com/ts-56',
              snippet: 'TypeScript 5.6 introduces a few new things.',
            },
            { title: 'TypeScript Handbook', url: 'https://example.com/handbook' },
          ],
        },
      ],
      durationSeconds: 1.5,
    };

    const result = WebSearchTool.mapToolResultToToolResultBlockParam(output, 'tool-use-1');

    expect(result.tool_use_id).toBe('tool-use-1');
    expect(result.type).toBe('tool_result');
    expect(typeof result.content).toBe('string');
    const content = result.content as string;
    expect(content).toContain('Web search results for query: "latest typescript features"');
    // Snippet should appear as a blockquote under the link
    expect(content).toContain('[TypeScript 5.6 Release Notes](https://example.com/ts-56)');
    expect(content).toContain('> TypeScript 5.6 introduces a few new things.');
    // Result without snippet should still render as a plain link
    expect(content).toContain('[TypeScript Handbook](https://example.com/handbook)');
    expect(content).toContain('REMINDER');
  });

  test('includes provider answer text alongside result links', () => {
    const output = {
      query: 'ts version',
      results: [
        '[tavily answer] TypeScript 5.6 is the latest stable version.',
        {
          tool_use_id: 'direct-tavily',
          content: [{ title: 'TS Release', url: 'https://example.com/ts', snippet: 'latest release' }],
        },
      ],
      durationSeconds: 0.8,
    };

    const result = WebSearchTool.mapToolResultToToolResultBlockParam(output, 'tool-use-2');
    const content = result.content as string;

    expect(content).toContain('[tavily answer] TypeScript 5.6 is the latest stable version.');
    expect(content).toContain('[TS Release](https://example.com/ts)');
    expect(content).toContain('> latest release');
  });

  test('handles empty results gracefully', () => {
    const output = {
      query: 'nothing here',
      results: [],
      durationSeconds: 0.3,
    };

    const result = WebSearchTool.mapToolResultToToolResultBlockParam(output, 'tool-use-3');
    const content = result.content as string;

    expect(content).toContain('Web search results for query: "nothing here"');
    expect(content).toContain('REMINDER');
  });

  test('handles content array with no results', () => {
    const output = {
      query: 'empty query',
      results: [
        {
          tool_use_id: 'search-1',
          content: [],
        },
      ],
      durationSeconds: 0.1,
    };

    const result = WebSearchTool.mapToolResultToToolResultBlockParam(output, 'tool-use-4');
    const content = result.content as string;

    expect(content).toContain('No links found.');
  });

  test('skips null and undefined entries in results', () => {
    const output = {
      query: 'null test',
      results: [
        null,
        undefined,
        '[some answer]',
        { tool_use_id: 'x', content: [{ title: 'T', url: 'https://e.com' }] },
      ],
      durationSeconds: 0.1,
    };

    const result = WebSearchTool.mapToolResultToToolResultBlockParam(output as any, 'tool-use-5');
    const content = result.content as string;

    // Null/undefined entries should be silently skipped
    expect(content).toContain('[some answer]');
    expect(content).toContain('[T](https://e.com)');
  });
});
