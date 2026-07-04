import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('provider registry', () => {
  test('anthropic is a first-class registry entry', async () => {
    const { PROVIDER_IDS, PROVIDER_REGISTRY, getPromptCachingSupport } = await import('./providerRegistry.js');

    const entry = PROVIDER_REGISTRY.anthropic;
    expect(entry).toBeDefined();
    expect(entry.envKey).toBe('ANTHROPIC_API_KEY');
    expect(entry.defaultModel).toBe('claude-opus-4-8');
    expect(entry.provider.getProviderId()).toBe('anthropic');
    expect(entry.models.map(m => m.id)).toContain('claude-opus-4-8');
    expect(PROVIDER_IDS).toContain('anthropic');
    expect(getPromptCachingSupport('anthropic')).toBe('explicit');
  });

  test('normalizeProviderId applies legacy aliases and rejects unknown ids', async () => {
    const { normalizeProviderId } = await import('./providerRegistry.js');

    expect(normalizeProviderId('gemini')).toBe('google');
    expect(normalizeProviderId('GEMINI')).toBe('google');
    expect(normalizeProviderId('google')).toBe('google');
    expect(normalizeProviderId('anthropic')).toBe('anthropic');
    expect(normalizeProviderId('not-a-provider')).toBeUndefined();
    expect(normalizeProviderId(undefined)).toBeUndefined();
    expect(normalizeProviderId('')).toBeUndefined();
  });
});

describe('legacy provider.json migration', () => {
  test('provider "gemini" resolves to google and its api key is copied', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'clew-provider-migration-'));
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'provider.json'),
      JSON.stringify({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        apiKeys: { gemini: 'legacy-key' },
      }),
    );
    process.env.CLEW_CONFIG_DIR = configDir;
    delete process.env.AI_PROVIDER;
    delete process.env.CLEW_CODE_USE_BEDROCK;
    delete process.env.CLEW_CODE_USE_VERTEX;
    delete process.env.CLEW_CODE_USE_FOUNDRY;

    const { ProviderManager } = await import(`./ProviderManager.js?migration-test=${Date.now()}`);
    const providerManager = ProviderManager.getInstance();
    providerManager.invalidateConfigCache();
    providerManager.setSessionProvider(null);

    const config = providerManager.getSelectedProviderConfig(true);
    expect(config.provider).toBe('google');
    expect(config.apiKeys?.google).toBe('legacy-key');
    // Non-destructive: legacy key stays so older versions keep working.
    expect((config.apiKeys as Record<string, string>)?.gemini).toBe('legacy-key');
    expect(providerManager.getActiveProviderName()).toBe('google');
  }, 15000);

  test('provider "anthropic" in provider.json is honored', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'clew-provider-anthropic-'));
    writeFileSync(join(configDir, 'provider.json'), JSON.stringify({ provider: 'anthropic' }));
    process.env.CLEW_CONFIG_DIR = configDir;
    delete process.env.AI_PROVIDER;

    const { ProviderManager } = await import(`./ProviderManager.js?anthropic-test=${Date.now()}`);
    const providerManager = ProviderManager.getInstance();
    providerManager.invalidateConfigCache();
    providerManager.setSessionProvider(null);

    expect(providerManager.getActiveProviderName()).toBe('anthropic');
  }, 15000);
});

describe('provider/model selection validation', () => {
  test('rejects unknown providers with the registry list as suggestions', async () => {
    const { validateProviderModelSelection } = await import('./providerSelection.js');

    const result = await validateProviderModelSelection('definitely-not-a-provider', 'some-model');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.suggestions).toContain('openai');
      expect(result.suggestions).toContain('anthropic');
    }
  });

  test('accepts a model from the provider catalog (google-assist static list)', async () => {
    const { validateProviderModelSelection } = await import('./providerSelection.js');

    const result = await validateProviderModelSelection('google-assist', 'gemini-3.5-flash');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.provider).toBe('google-assist');
      expect(result.model).toBe('gemini-3.5-flash');
    }
  });

  test('rejects an unknown model with suggestions', async () => {
    const { validateProviderModelSelection } = await import('./providerSelection.js');

    const result = await validateProviderModelSelection('google-assist', 'gpt-5.5');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('gpt-5.5');
      expect(result.suggestions?.length).toBeGreaterThan(0);
    }
  });

  test('accepts any model for the custom provider', async () => {
    const { validateProviderModelSelection } = await import('./providerSelection.js');

    const result = await validateProviderModelSelection('custom', 'my-local-model');
    expect(result.valid).toBe(true);
  });
});
