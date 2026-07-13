import { describe, expect, it } from 'bun:test';
import { stringifyWithRedactedSecrets } from './redactSecrets.js';

describe('stringifyWithRedactedSecrets', () => {
  it('redacts nested apiKeys values but keeps their provider names', () => {
    const config = {
      provider: 'opencode',
      apiKeys: { opengateway: 'ogw_live_secret', xai: 'xai-secret' },
    };
    const out = stringifyWithRedactedSecrets(config);
    expect(out).not.toContain('ogw_live_secret');
    expect(out).not.toContain('xai-secret');
    const parsed = JSON.parse(out);
    expect(parsed.provider).toBe('opencode');
    expect(parsed.apiKeys.opengateway).toBe('[REDACTED]');
    expect(parsed.apiKeys.xai).toBe('[REDACTED]');
  });

  it('redacts scalar secret fields at any depth', () => {
    const out = stringifyWithRedactedSecrets({
      provider: { token: 'abc123', authorization: 'Bearer zzz' },
      label: 'OpenCode',
    });
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('Bearer zzz');
    const parsed = JSON.parse(out);
    expect(parsed.label).toBe('OpenCode');
    expect(parsed.provider.token).toBe('[REDACTED]');
    expect(parsed.provider.authorization).toBe('[REDACTED]');
  });

  it('leaves non-secret fields untouched', () => {
    const parsed = JSON.parse(stringifyWithRedactedSecrets({ envKey: 'OPENCODE_API_KEY', model: 'gpt-5.5' }));
    // envKey is the name of the env var, not a secret value
    expect(parsed.envKey).toBe('OPENCODE_API_KEY');
    expect(parsed.model).toBe('gpt-5.5');
  });
});
