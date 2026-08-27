import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { ProviderManager } from './ProviderManager.js';
import { clearProviderModelsCache, fetchProviderModels } from './providerModels.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearProviderModelsCache();
});

describe('provider model discovery', () => {
  test('provider setup uses the same registry-aware Cline catalog as /model', async () => {
    const providerManager = ProviderManager.getInstance();
    const apiKeySpy = spyOn(providerManager, 'getApiKeyForProvider').mockReturnValue('test-cline-key');
    let requestedUrl = '';

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'live/new-cline-model',
              name: 'New Cline Model',
              context_length: 1_000_000,
              architecture: { input_modalities: ['text', 'image'] },
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
      expect(models.map(model => model.id)).toEqual(['live/new-cline-model']);
      expect(models[0]).toEqual(
        expect.objectContaining({
          label: 'New Cline Model',
          tags: expect.arrayContaining(['tools', 'vision', 'reasoning', 'free']),
          capabilities: expect.objectContaining({
            toolCalling: 'native',
            vision: true,
            reasoning: true,
            maxContext: 1_000_000,
            maxOutput: 128_000,
          }),
        }),
      );
    } finally {
      apiKeySpy.mockRestore();
    }
  });
});
