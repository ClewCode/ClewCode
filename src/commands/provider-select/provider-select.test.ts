import { afterAll, describe, expect, test } from 'bun:test';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
import { parseProviderKeyCommandArgs, runProviderCommand } from './provider-select.js';

afterAll(() => {
  ProviderManager.getInstance().setSessionApiKeys({ groq: '' });
});

describe('/providers key', () => {
  test('applies a session-only key immediately instead of reporting a no-op success', async () => {
    const result = await runProviderCommand('key groq session-only-key');

    expect(ProviderManager.getInstance().getApiKeyForProvider('groq')).toBe('session-only-key');
    expect(result.result.type).toBe('text');
    if (result.result.type === 'text') {
      expect(result.result.value).toContain('(Session only)');
    }
  });

  test('strips global flags before parsing the API key', () => {
    expect(parseProviderKeyCommandArgs(['exact-global-key', '--global'])).toEqual({
      isGlobal: true,
      apiKey: 'exact-global-key',
      setParts: [],
    });
    expect(parseProviderKeyCommandArgs(['exact-short-key', '-g'])).toEqual({
      isGlobal: true,
      apiKey: 'exact-short-key',
      setParts: [],
    });
  });
});
