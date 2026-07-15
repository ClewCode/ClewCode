import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// saveSelectedProviderConfig() reverts `provider` to the on-disk value while a
// session override is active, so one terminal's switch can't leak into the
// shared provider.json. `providerConfig` describes that same provider, so it
// has to be reverted with it — otherwise the file ends up self-contradictory
// (provider: opencode alongside a chatgpt providerConfig) and
// getActiveProviderName() resolves the stale provider forever.
test('reverting the session provider also reverts providerConfig', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'clew-provider-consistency-'));
  process.env.CLEW_CONFIG_DIR = configDir;
  delete process.env.AI_PROVIDER;

  writeFileSync(
    join(configDir, 'provider.json'),
    JSON.stringify({
      provider: 'opencode',
      model: 'opencode-model',
      providerConfig: { providerId: 'opencode', label: 'OpenCode' },
    }),
    'utf8',
  );

  const { ProviderManager } = await import(`./ProviderManager.js?consistency=${Date.now()}`);
  const providerManager = ProviderManager.getInstance();
  providerManager.invalidateConfigCache();

  // A session-scoped switch to chatgpt, as /providers set (non-global) does.
  providerManager.setSessionProvider('chatgpt');

  // /model --persistAsDefault writes the session-overlaid config back to disk.
  providerManager.saveSelectedProviderConfig({
    provider: 'chatgpt',
    model: 'gpt-5.6-sol',
    providerConfig: { providerId: 'chatgpt', label: 'ChatGPT (Subscription)' },
  });

  const onDisk = providerManager.getOnDiskProviderConfig(true);

  // provider is reverted (existing, intended behaviour)...
  expect(onDisk.provider).toBe('opencode');
  // ...so providerConfig must describe that same provider, not the session's.
  expect((onDisk.providerConfig as { providerId?: string } | undefined)?.providerId).toBe('opencode');

  providerManager.setSessionProvider(null);
}, 15000);
