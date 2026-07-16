import { expect, mock, test } from 'bun:test';

const calls: string[] = [];

mock.module('./installedPluginsManager.js', () => ({
  clearInstalledPluginsCache: () => calls.push('installed-cache'),
}));
mock.module('./cacheUtils.js', () => ({ clearAllCaches: () => calls.push('plugin-caches') }));
mock.module('./orphanedPluginFilter.js', () => ({ clearPluginCacheExclusions: () => undefined }));
mock.module('./pluginLoader.js', () => ({
  loadAllPlugins: async () => {
    calls.push('load');
    return { enabled: [], disabled: [], errors: [] };
  },
}));
mock.module('./loadPluginCommands.js', () => ({ getPluginCommands: async () => [] }));
mock.module('./loadPluginHooks.js', () => ({ loadPluginHooks: async () => undefined }));
mock.module('./lspPluginIntegration.js', () => ({ loadPluginLspServers: async () => ({}) }));
mock.module('./mcpPluginIntegration.js', () => ({ loadPluginMcpServers: async () => ({}) }));
mock.module('../../tools/AgentTool/loadAgentsDir.js', () => ({
  getAgentDefinitionsWithOverrides: async () => ({ activeAgents: [], allAgents: [] }),
}));
mock.module('../../services/lsp/manager.js', () => ({ reinitializeLspServerManager: () => undefined }));

const { refreshActivePlugins } = await import('./refresh.js');

test('reloads the installed-plugin snapshot before loading plugins', async () => {
  calls.length = 0;
  await refreshActivePlugins(() => undefined);

  expect(calls).toEqual(['plugin-caches', 'installed-cache', 'load']);
});
