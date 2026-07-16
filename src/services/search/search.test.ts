import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Provider configuration falls back to settings.env, so a real user settings
// file would otherwise leak API keys into these tests and hit the live API.
mock.module('../../utils/settings/settings.js', () => ({
  getSettings_DEPRECATED: () => ({ env: {} }),
}));

const { getConfiguredProviders, searchWithFallback, searchWithProvider } = await import('./index.js');

const realFetch = globalThis.fetch;

function tavilyBody(titles: string[]) {
  return JSON.stringify({
    results: titles.map((title, i) => ({
      title,
      url: `https://example.com/${i}`,
      content: 'snippet',
      score: 1,
    })),
  });
}

function jsonResponse(body: string, init?: ResponseInit) {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

beforeEach(() => {
  process.env.TAVILY_API_KEY = 'tvly-test';
  delete process.env.BRAVE_API_KEY;
  delete process.env.SERPER_API_KEY;
  delete process.env.JINA_API_KEY;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TAVILY_API_KEY;
  delete process.env.BRAVE_API_KEY;
  delete process.env.SERPER_API_KEY;
  delete process.env.JINA_API_KEY;
});

describe('tavily provider', () => {
  test('authenticates with a Bearer header, not an api_key body field', async () => {
    let seenInit: RequestInit | undefined;
    globalThis.fetch = mock(async (_url: any, init?: RequestInit) => {
      seenInit = init;
      return jsonResponse(tavilyBody(['hit']));
    }) as any;

    await searchWithProvider('tavily', 'q');

    const headers = seenInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tvly-test');
    expect(JSON.parse(String(seenInit?.body))).not.toHaveProperty('api_key');
  });

  test('passes an abort signal to fetch so a timeout cancels the request', async () => {
    let seenSignal: AbortSignal | undefined;
    globalThis.fetch = mock(async (_url: any, init?: RequestInit) => {
      seenSignal = init?.signal ?? undefined;
      return jsonResponse(tavilyBody(['hit']));
    }) as any;

    await searchWithProvider('tavily', 'q');

    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });

  test('tolerates a response with no results array', async () => {
    globalThis.fetch = mock(async () => jsonResponse(JSON.stringify({ answer: 'nothing found' }))) as any;

    const response = await searchWithProvider('tavily', 'q');

    expect(response.results).toEqual([]);
  });
});

describe('rate limiting', () => {
  test('retries a 429 and honors retry-after', async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      if (calls === 1) {
        return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } });
      }
      return jsonResponse(tavilyBody(['after retry']));
    }) as any;

    const response = await searchWithProvider('tavily', 'q');

    expect(calls).toBe(2);
    expect(response.results[0]?.title).toBe('after retry');
  });

  test('gives up after exhausting retries', async () => {
    globalThis.fetch = mock(
      async () => new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } }),
    ) as any;

    await expect(searchWithProvider('tavily', 'q')).rejects.toThrow(/rate limit exceeded/);
  });
});

describe('searchWithFallback', () => {
  test('falls through to the next provider when the first one fails', async () => {
    process.env.BRAVE_API_KEY = 'brave-test';

    globalThis.fetch = mock(async (url: any) => {
      if (String(url).includes('tavily')) {
        return new Response('boom', { status: 500 });
      }
      return jsonResponse(
        JSON.stringify({ web: { results: [{ title: 'brave hit', url: 'https://b.com', description: 'd' }] } }),
      );
    }) as any;

    const response = await searchWithFallback('q');

    expect(response.provider).toBe('brave');
    expect(response.results[0]?.title).toBe('brave hit');
  });

  test('falls through when a provider returns zero results', async () => {
    process.env.BRAVE_API_KEY = 'brave-test';

    globalThis.fetch = mock(async (url: any) => {
      if (String(url).includes('tavily')) {
        return jsonResponse(tavilyBody([]));
      }
      return jsonResponse(
        JSON.stringify({ web: { results: [{ title: 'brave hit', url: 'https://b.com', description: 'd' }] } }),
      );
    }) as any;

    const response = await searchWithFallback('q');

    expect(response.provider).toBe('brave');
  });

  test('reports every provider failure when all of them fail', async () => {
    process.env.BRAVE_API_KEY = 'brave-test';
    globalThis.fetch = mock(async () => new Response('boom', { status: 500 })) as any;

    const error = await searchWithFallback('q').catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('tavily');
    expect((error as Error).message).toContain('brave');
  });

  test('throws a configuration error without touching the network when no provider has an API key', async () => {
    delete process.env.TAVILY_API_KEY;
    const fetchSpy = mock(async () => jsonResponse(tavilyBody(['should never run'])));
    globalThis.fetch = fetchSpy as any;

    await expect(searchWithFallback('q')).rejects.toThrow(/No web search provider API keys are configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getConfiguredProviders', () => {
  test('lists configured providers in preference order', () => {
    process.env.SERPER_API_KEY = 'serper-test';
    process.env.BRAVE_API_KEY = 'brave-test';
    process.env.JINA_API_KEY = 'jina-test';

    expect(getConfiguredProviders()).toEqual(['tavily', 'brave', 'serper', 'jina']);
  });

  test('omits providers with no API key', () => {
    expect(getConfiguredProviders()).toEqual(['tavily']);
  });

  test('never includes duckduckgo, whose results are too poor to use by default', () => {
    expect(getConfiguredProviders()).not.toContain('duckduckgo');
  });
});

describe('tavily answer', () => {
  test("propagates the provider's generated answer", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(
        JSON.stringify({
          answer: 'a summary',
          results: [{ title: 't', url: 'https://e.com', content: 'c', score: 1 }],
        }),
      ),
    ) as any;

    const response = await searchWithProvider('tavily', 'q');

    expect(response.answer).toBe('a summary');
  });
});

describe('explicit provider list', () => {
  test('honors an explicit providers option, including unconfigured free ones', async () => {
    const tried: string[] = [];
    globalThis.fetch = mock(async (url: any) => {
      if (String(url).includes('tavily')) return new Response('boom', { status: 500 });
      return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }) as any;

    // duckduckgo has no API key, so it can only be reached by opting in.
    // Both providers fail here; the assertion is about which ones were attempted.
    await searchWithFallback('q', { providers: ['tavily', 'duckduckgo'] }, p => tried.push(p)).catch(() => undefined);

    expect(tried).toEqual(['tavily', 'duckduckgo']);
  });
});
