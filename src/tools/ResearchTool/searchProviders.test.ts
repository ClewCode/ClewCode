import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

mock.module('../../utils/settings/settings.js', () => ({
  getSettings_DEPRECATED: () => ({ env: {} }),
}));

const { getSearchProviderPriority, searchWithProviders } = await import('./searchProviders.js');

const realFetch = globalThis.fetch;

function tavilyResponse(titles: string[], answer?: string) {
  return new Response(
    JSON.stringify({
      answer,
      results: titles.map((title, i) => ({
        title,
        url: `https://example.com/${i}`,
        content: 'some excerpt',
        score: 1,
      })),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

beforeEach(() => {
  process.env.TAVILY_API_KEY = 'tvly-test';
  delete process.env.BRAVE_API_KEY;
  delete process.env.JINA_API_KEY;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TAVILY_API_KEY;
  delete process.env.BRAVE_API_KEY;
  delete process.env.JINA_API_KEY;
});

describe('getSearchProviderPriority', () => {
  test('appends duckduckgo as a last resort so research never comes back empty-handed', () => {
    expect(getSearchProviderPriority()).toEqual(['tavily', 'duckduckgo']);
  });
});

describe('searchWithProviders', () => {
  test('maps results into the research shape with excerpts and scores', async () => {
    globalThis.fetch = mock(async () => tavilyResponse(['hit one'], 'the answer')) as any;

    const [result] = await searchWithProviders('q', { maxResults: 5 });

    expect(result?.source).toBe('tavily');
    expect(result?.answer).toBe('the answer');
    expect(result?.results[0]).toMatchObject({
      title: 'hit one',
      url: 'https://example.com/0',
      excerpt: 'some excerpt',
    });
    expect(result?.results[0]?.score).toBeDefined();
  });

  test('stops at the first provider that returns results instead of querying every one', async () => {
    process.env.BRAVE_API_KEY = 'brave-test';
    const hits: string[] = [];
    globalThis.fetch = mock(async (url: any) => {
      hits.push(String(url).includes('tavily') ? 'tavily' : 'other');
      return tavilyResponse(['hit']);
    }) as any;

    await searchWithProviders('q');

    expect(hits).toEqual(['tavily']);
  });

  test('returns an empty array rather than throwing when every provider fails', async () => {
    globalThis.fetch = mock(async () => new Response('boom', { status: 500 })) as any;

    expect(await searchWithProviders('q')).toEqual([]);
  });
});
