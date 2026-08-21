import { afterEach, describe, expect, test } from 'bun:test';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
import { applyProviderSwitch, providerDisplayName, resolveModelSelection } from './providerSwitch.js';

afterEach(() => {
  const providerManager = ProviderManager.getInstance();
  providerManager.setSessionProviderConfig(null);
  providerManager.setSessionProvider(null);
  providerManager.setSessionModel(null);
});

describe('resolveModelSelection', () => {
  test('splits a provider-prefixed picker row', () => {
    expect(resolveModelSelection('openai/gpt-4o')).toEqual({ targetProvider: 'openai', model: 'gpt-4o' });
  });

  test('keeps a bare model id whole', () => {
    expect(resolveModelSelection('gpt-4o')).toEqual({ model: 'gpt-4o' });
  });

  test('keeps only the first segment as the provider', () => {
    expect(resolveModelSelection('openrouter/deepseek/deepseek-chat')).toEqual({
      targetProvider: 'openrouter',
      model: 'deepseek/deepseek-chat',
    });
  });

  test('leaves an unknown prefix alone', () => {
    expect(resolveModelSelection('not-a-provider/some-model')).toEqual({ model: 'not-a-provider/some-model' });
  });
});

describe('applyProviderSwitch (session scope)', () => {
  test('routes the session to the picked model’s provider', () => {
    const patch = applyProviderSwitch({ targetProvider: 'openai', model: 'gpt-4o', persistAsDefault: false });

    expect(patch).toEqual({ mainLoopProviderForSession: 'openai' });

    // The overlay is what actually redirects the request — AppState only
    // mirrors it back through onChangeAppState.
    const overlay = ProviderManager.getInstance().getSessionProviderConfig();
    expect(overlay?.provider).toBe('openai');
    expect(overlay?.model).toBe('gpt-4o');
    expect(overlay?.providerConfig).toBeTruthy();
  });

  test('normalizes legacy provider ids', () => {
    const patch = applyProviderSwitch({ targetProvider: 'gemini', model: 'gemini-2.5-pro', persistAsDefault: false });
    expect(patch).toEqual({ mainLoopProviderForSession: 'google' });
    expect(ProviderManager.getInstance().getSessionProviderConfig()?.provider).toBe('google');
  });

  test('is a no-op without a target provider', () => {
    expect(applyProviderSwitch({ targetProvider: undefined, model: 'gpt-4o', persistAsDefault: false })).toBeNull();
    expect(ProviderManager.getInstance().getSessionProviderConfig()).toBeNull();
  });

  test('drops an unknown provider instead of routing to it', () => {
    expect(applyProviderSwitch({ targetProvider: 'not-a-provider', model: 'x', persistAsDefault: false })).toBeNull();
    expect(ProviderManager.getInstance().getSessionProviderConfig()).toBeNull();
  });
});

describe('providerDisplayName', () => {
  test('renders a registry label', () => {
    expect(providerDisplayName('openai')).toBeTruthy();
    expect(providerDisplayName('openai')).not.toBe('');
  });

  test('falls back to the raw input for unknown ids', () => {
    expect(providerDisplayName('not-a-provider')).toBe('not-a-provider');
    expect(providerDisplayName(undefined)).toBe('');
  });
});
