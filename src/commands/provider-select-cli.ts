/**
 * `clew provider` — terminal provider/model selector.
 *
 * All provider metadata comes from PROVIDER_REGISTRY (providers.json); this
 * file must not carry its own provider list. Config reads/writes go through
 * ProviderManager so path resolution and legacy migrations stay in one place.
 */

import { createInterface } from 'readline';
import { type ProviderConfigFile, ProviderManager } from '../services/ai/ProviderManager.js';
import { fetchProviderModels } from '../services/ai/providerModels.js';
import {
  DEFAULT_PROVIDER,
  getProviderRegistryEntry,
  normalizeProviderId,
  PROVIDER_IDS,
  type ProviderRegistryEntry,
} from '../services/ai/providerRegistry.js';
import { validateProviderModelSelection } from '../services/ai/providerSelection.js';
import type { ProviderId } from '../services/ai/providers/ProviderInterface.js';
import { readLocalProviderKey } from '../utils/localProviderKeys.js';

type SerializableProviderRegistryEntry = Omit<ProviderRegistryEntry, 'provider'>;

function getSerializableProviderInfo(provider: ProviderId): SerializableProviderRegistryEntry {
  const { provider: _instance, ...serializable } = getProviderRegistryEntry(provider);
  return serializable;
}

function loadConfig(): ProviderConfigFile {
  return ProviderManager.getInstance().getSelectedProviderConfig(true);
}

function saveConfig(config: ProviderConfigFile): void {
  const providerManager = ProviderManager.getInstance();
  providerManager.saveSelectedProviderConfig(config);
  console.log('✅ Config saved to', providerManager.getProviderConfigPathForSave());
}

function hasApiKey(provider: ProviderId, config: ProviderConfigFile): boolean {
  const info = getProviderRegistryEntry(provider);
  return Boolean(
    config.apiKeys?.[provider] || (info.envKey && process.env[info.envKey]) || readLocalProviderKey(provider),
  );
}

async function fetchModels(provider: ProviderId): Promise<string[]> {
  try {
    return (await fetchProviderModels(provider)).map(model => model.id);
  } catch (e) {
    console.log(`⚠️  Failed to fetch models: ${e}`);
    const info = getProviderRegistryEntry(provider);
    if (info.defaultModelVerified && info.defaultModel) {
      return [info.defaultModel];
    }
    return [];
  }
}

function promptLine(question: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    readline.question(question, answer => {
      readline.close();
      resolve(answer.trim());
    });
  });
}

async function promptForModel(provider: ProviderId): Promise<string> {
  const info = getProviderRegistryEntry(provider);
  return promptLine(`\n🔧 Enter a model for ${info.label}: `);
}

async function promptForApiKey(provider: ProviderId): Promise<string> {
  const info = getProviderRegistryEntry(provider);
  if (info.isLocal) {
    return '';
  }

  const hasExistingKey = hasApiKey(provider, loadConfig());

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  }) as any;

  readline.stdoutMuted = false;
  readline._writeToOutput = function _writeToOutput(stringToWrite: string) {
    if (readline.stdoutMuted && stringToWrite.trim()) {
      readline.output.write('*'.repeat(stringToWrite.length));
      return;
    }
    readline.output.write(stringToWrite);
  };

  const promptStr = hasExistingKey
    ? `\n🔑 Enter ${info.envKey} for ${info.label} (leave blank to keep existing): `
    : `\n🔑 Enter ${info.envKey} for ${info.label}: `;

  return new Promise(resolve => {
    process.stdout.write(promptStr);
    readline.stdoutMuted = true;
    readline.question('', (answer: string) => {
      readline.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

function selectFromList<T>(items: T[], display: (item: T) => string): Promise<T> {
  console.log('\n📋 Available options:');
  items.forEach((item, i) => {
    console.log(`  ${i + 1}. ${display(item)}`);
  });

  const readline = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    readline.question(`\n🔢 Select (1-${items.length}): `, answer => {
      readline.close();
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < items.length) {
        resolve(items[idx]!);
      } else {
        console.log('❌ Invalid selection, using first option');
        resolve(items[0]!);
      }
    });
  });
}

async function selectProvider(): Promise<ProviderConfigFile> {
  console.log('\n🚀 Clew Code - Provider & Model Selector\n');

  console.log('🌐 Available providers:');
  PROVIDER_IDS.forEach((p, i) => {
    const info = getProviderRegistryEntry(p);
    console.log(`  ${i + 1}. ${info.label} ${info.isLocal ? '(Local)' : ''}`);
  });

  const answer = await promptLine(`\n🔧 Select provider (1-${PROVIDER_IDS.length}): `);
  const idx = parseInt(answer, 10) - 1;
  const provider = PROVIDER_IDS[idx] ?? PROVIDER_IDS[0] ?? DEFAULT_PROVIDER;
  const info = getProviderRegistryEntry(provider);

  console.log(`\n⏳ Fetching models from ${info.label}...`);
  const models = await fetchModels(provider);

  let model: string;
  if (models.length > 0) {
    model = await selectFromList(models, m => m);
  } else {
    model = await promptForModel(provider);
    if (!model) {
      console.log('❌ No model provided. Aborting.');
      process.exit(1);
    }
  }

  const validation = await validateProviderModelSelection(provider, model);
  if (!validation.valid) {
    console.log(`❌ ${validation.error}`);
    if (validation.suggestions?.length) {
      console.log('   Did you mean:', validation.suggestions.join(', '));
    }
    process.exit(1);
  }
  model = validation.model ?? model;

  const apiKey = await promptForApiKey(provider);
  const currentConfig = loadConfig();
  const hasExistingKey = hasApiKey(provider, currentConfig);

  if (!info.isLocal && !apiKey && !hasExistingKey) {
    console.log(`❌ No API key provided for ${info.envKey}. Aborting.`);
    process.exit(1);
  }

  const apiKeys = {
    ...(currentConfig.apiKeys || {}),
    ...(apiKey ? { [provider]: apiKey } : {}),
  };

  return {
    provider,
    model,
    providerConfig: getSerializableProviderInfo(provider) as unknown as Record<string, unknown>,
    apiKeys,
  };
}

export async function runProviderSelectCli(options: {
  list?: boolean;
  set?: boolean;
  get?: boolean;
  reset?: boolean;
  models?: string;
  modelsUrl?: boolean;
}): Promise<void> {
  if (options.list) {
    console.log('\n📦 Available providers:\n');
    for (const providerId of PROVIDER_IDS) {
      const info = getProviderRegistryEntry(providerId);
      console.log(`🌐 ${info.label} (${providerId}):`);
      console.log(`   Default: ${info.defaultModel ?? '(dynamic)'}`);
      console.log(`   Base:   ${info.defaultBaseUrl}`);
      if (info.note) {
        console.log(`   Note:   ${info.note}`);
      }
      console.log();
    }
    return;
  }

  if (options.models) {
    const provider = normalizeProviderId(options.models);
    if (!provider) {
      console.log(`❌ Unknown provider: ${options.models}`);
      console.log('Available:', PROVIDER_IDS.join(', '));
      return;
    }
    const info = getProviderRegistryEntry(provider);
    console.log(`\n⏳ Fetching models from ${info.label}...`);
    const models = await fetchModels(provider);
    console.log(`\n📋 Models from ${info.label} (${models.length}):\n`);
    models.slice(0, 30).forEach(m => {
      console.log(`   • ${m}`);
    });
    if (models.length > 30) {
      console.log(`   ... and ${models.length - 30} more`);
    }
    return;
  }

  if (options.modelsUrl) {
    console.log('\n📡 Models API URLs:\n');
    for (const providerId of PROVIDER_IDS) {
      const info = getProviderRegistryEntry(providerId);
      console.log(`🌐 ${info.label}:`);
      console.log(`   ${info.modelsUrl ?? '(none)'}`);
      console.log();
    }
    return;
  }

  if (options.reset) {
    const info = getProviderRegistryEntry(DEFAULT_PROVIDER);
    const currentConfig = loadConfig();
    const defaultConfig: ProviderConfigFile = {
      provider: DEFAULT_PROVIDER,
      model: info.defaultModel ?? '',
      providerConfig: getSerializableProviderInfo(DEFAULT_PROVIDER) as unknown as Record<string, unknown>,
      apiKeys: currentConfig.apiKeys,
    };
    saveConfig(defaultConfig);
    console.log(`🔄 Reset to default: ${DEFAULT_PROVIDER} (${defaultConfig.model})`);
    return;
  }

  if (options.get) {
    const config = loadConfig();
    if (config.provider) {
      console.log('\n⚙️  Current configuration:\n');
      console.log(`  Provider: ${config.provider}`);
      console.log(`  Model:    ${config.model}`);
      console.log(`  Config:   ${ProviderManager.getInstance().getProviderConfigPath()}`);
      console.log();
    } else {
      console.log('\n⚠️  No configuration found. Run with --set to configure.\n');
    }
    return;
  }

  const config = await selectProvider();
  saveConfig(config);
  console.log(options.set ? '\n✅ Configuration updated!\n' : '\n✅ Configuration saved!\n');
  console.log(`  Provider: ${config.provider}`);
  console.log(`  Model:    ${config.model}\n`);
}
