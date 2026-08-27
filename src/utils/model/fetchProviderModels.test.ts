import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
import { fetchProviderModels } from './fetchProviderModels.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchProviderModels', () => {
  test('uses Cline live catalog endpoint and parses its model metadata', async () => {
    const providerManager = ProviderManager.getInstance();
    const apiKeySpy = spyOn(providerManager, 'getApiKeyForProvider').mockReturnValue('test-cline-key');
    let requestedUrl = '';

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'poolside/laguna-s-2.1:free',
              name: 'Poolside: Laguna S 2.1 (free)',
              description: 'Live Cline model',
              context_length: 1_000_000,
              architecture: { input_modalities: ['text'] },
              pricing: { prompt: '0', completion: '0' },
              supported_parameters: ['tools', 'reasoning'],
              top_provider: { max_completion_tokens: 128_000 },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const models = await fetchProviderModels('cline');

      expect(requestedUrl).toBe('https://api.cline.bot/api/v1/ai/cline/models');
      expect(models).toEqual([
        expect.objectContaining({
          id: 'poolside/laguna-s-2.1:free',
          label: 'Poolside: Laguna S 2.1 (free)',
          contextWindow: 1_000_000,
          maxOutput: 128_000,
          supportsTools: true,
          supportsReasoning: true,
          free: true,
        }),
      ]);
    } finally {
      apiKeySpy.mockRestore();
    }
  });
});
