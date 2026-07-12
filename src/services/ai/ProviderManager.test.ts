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

describe('session model isolation', () => {
  test('falls back from an unsupported config model to the provider default', async () => {
    const { ProviderManager } = await import('./ProviderManager.js');
    const providerManager = ProviderManager.getInstance();
    const savedProvider = providerManager.getActiveProviderName();

    // When config.model is unset (or unsupported for google-assist),
    // getModelForProvider should return the registry default, not undefined.
    providerManager.setSessionProvider(null);
    providerManager.invalidateConfigCache();
    const result = providerManager.getModelForProvider();
    expect(result).toBeTruthy();

    // Restore
    providerManager.setSessionProvider(savedProvider);
  });

  test('getModelForProvider reads from config, not session state', async () => {
    const { ProviderManager } = await import('./ProviderManager.js');
    const providerManager = ProviderManager.getInstance();
    const saved = providerManager.getModelForProvider();

    // Session model should NOT affect getModelForProvider (it lives in
    // AppState's mainLoopModelForSession, synced to mainLoopModelOverride).
    providerManager.setSessionModel('some-temp-model');

    // Should still return the config model, not the session model
    expect(providerManager.getModelForProvider()).toBe(saved);

    providerManager.setSessionModel(null);
  });
});
