import { describe, expect, test } from 'bun:test';
import { getProviderCapabilityEntry, getProviderModelInfo } from './providerCapabilities.js';

describe('providerCapabilities', () => {
  test('reads provider capability data without instantiating providers', () => {
    const entry = getProviderCapabilityEntry('anthropic');

    expect(entry).toBeDefined();
    expect(entry.capabilities).toBeDefined();
    // The live provider instance belongs to providerRegistry; pulling it in
    // here is what created the import cycle.
    expect('provider' in entry).toBe(false);
  });

  test('looks up model-level capabilities', () => {
    const entry = getProviderCapabilityEntry('anthropic');
    const known = entry.models[0];
    expect(known).toBeDefined();

    expect(getProviderModelInfo('anthropic', known!.id)?.id).toBe(known!.id);
    expect(getProviderModelInfo('anthropic', 'no-such-model')).toBeUndefined();
  });

  test('importing the adapter first does not trip the registry import cycle', async () => {
    // adapter -> providerRegistry -> ChatGPTProvider -> adapter used to close a
    // cycle, so whichever module loaded first decided whether registerAdapter()
    // ran against an initialized adapterRegistry. Importing the adapter first
    // threw "Cannot access 'adapterRegistry' before initialization".
    const adapter = await import('./adapter/AnthropicAdapter.js');
    await import('./providers/ChatGPTProvider.js');

    expect(adapter.getAdapter('chatgpt')).toBeDefined();
  });

  test('providerRegistry still re-exports getProviderModelInfo', async () => {
    const registry = await import('./providerRegistry.js');

    expect(registry.getProviderModelInfo).toBe(getProviderModelInfo);
  });
});
