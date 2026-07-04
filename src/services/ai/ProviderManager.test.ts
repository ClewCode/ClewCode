import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

test('defaults to OpenAI when no provider is configured', async () => {
  process.env.CLEW_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'claude-provider-test-'));
  delete process.env.AI_PROVIDER;
  delete process.env.CLEW_CODE_USE_BEDROCK;
  delete process.env.CLEW_CODE_USE_VERTEX;
  delete process.env.CLEW_CODE_USE_FOUNDRY;

  const cacheBust = Date.now();
  const [{ ProviderManager }, { DEFAULT_PROVIDER }] = await Promise.all([
    import(`./ProviderManager.js?default-provider-test=${cacheBust}`),
    import('./providerRegistry.js'),
  ]);
  const providerManager = ProviderManager.getInstance();
  providerManager.invalidateConfigCache();
  providerManager.setSessionProvider(null);

  expect(DEFAULT_PROVIDER).toBe('openai');
  expect(providerManager.getSelectedProviderConfig()).toEqual({});
  expect(providerManager.getActiveProviderName()).toBe('openai');
}, 15000);

describe('google-assist provider metadata', () => {
  test('advertises Gemini 3.5 Flash as the OAuth default', async () => {
    const { PROVIDER_REGISTRY, createProviderInstance } = await import('./providerRegistry.js');
    const registryEntry = PROVIDER_REGISTRY['google-assist'];
    const providerModels = await createProviderInstance('google-assist').listModels({
      apiKey: '',
      baseURL: registryEntry.defaultBaseUrl,
    });
    const modelIds = providerModels.map(model => model.id);

    expect(registryEntry.defaultBaseUrl).toBe('https://daily-cloudcode-pa.googleapis.com/v1internal');
    expect(registryEntry.defaultModel).toBe('gemini-3.5-flash');
    expect(modelIds).toContain(registryEntry.defaultModel);
  });

  test('falls back from a stale unsupported session model to the provider default', async () => {
    const { ProviderManager } = await import('./ProviderManager.js');
    const providerManager = ProviderManager.getInstance();

    providerManager.setSessionProvider('google-assist');
    providerManager.setSessionModel('gemini-3.1-pro');

    expect(providerManager.getModelForProvider()).toBe('gemini-3.5-flash');

    providerManager.setSessionModel(null);
    providerManager.setSessionProvider(null);
  });

  test('validates Gemini Code Assist models against the provider list', async () => {
    const { ProviderManager } = await import('./ProviderManager.js');
    const { validateModel } = await import('../../utils/model/validateModel.js');
    const providerManager = ProviderManager.getInstance();

    providerManager.setSessionProvider('google-assist');

    await expect(validateModel('gemini-3.5-flash')).resolves.toEqual({ valid: true });
    await expect(validateModel('gemini-3.1-pro')).resolves.toEqual({
      valid: false,
      error: "Model 'gemini-3.1-pro' is not supported by Gemini Code Assist. Try 'gemini-3.5-flash' instead",
    });

    providerManager.setSessionProvider(null);
  });
});
