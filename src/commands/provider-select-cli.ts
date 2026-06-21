import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { getClewConfigHomeDir } from '../utils/envUtils.js';
import { readLocalProviderKey } from '../utils/localProviderKeys.js';

interface ProviderInfo {
  label: string;
  envKey: string;
  baseUrl: string;
  modelsUrl: string;
  defaultModel: string;
  defaultModelVerified?: boolean;
  timeout: number;
  note: string;
  isLocal?: boolean;
  supportsStreaming?: boolean;
}

const PROVIDERS: Record<string, ProviderInfo> = {
  openai: {
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    modelsUrl: 'https://api.openai.com/v1/models',
    defaultModel: 'gpt-5.4-mini',
    defaultModelVerified: true,
    timeout: 60000,
    note: 'gpt-5.4 = flagship, gpt-5.4-mini = cost-efficient, gpt-5.4-nano = cheapest',
  },
  anthropic: {
    label: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultModelVerified: true,
    timeout: 90000,
    note: 'claude-opus-4-20250514 = most capable, claude-sonnet-4-20250514 = balanced',
  },
  gemini: {
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.5-flash',
    defaultModelVerified: true,
    timeout: 60000,
    note: 'gemini-2.5-flash = best price-performance',
  },
  'google-assist': {
    label: 'Gemini Code Assist (OAuth)',
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://cloudcode-pa.googleapis.com/v1internal',
    modelsUrl: '',
    defaultModel: 'gemini-2.5-flash',
    defaultModelVerified: true,
    timeout: 60000,
    note: 'ใช้ OAuth จาก ~/.gemini/oauth_creds.json, ไม่ต้องใช้ API key',
    isLocal: false,
  },
  openrouter: {
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    defaultModel: 'openai/gpt-5.4-mini',
    timeout: 120000,
    note: 'ใช้ model string แบบ provider/model-name',
  },
  opencode: {
    label: 'OpenCode',
    envKey: 'OPENCODE_API_KEY',
    baseUrl: 'https://opencode.ai/zen/v1',
    modelsUrl: 'https://opencode.ai/zen/v1/models',
    defaultModel: 'qwen3.6-plus',
    timeout: 120000,
    note: 'For OpenAI-compatible /chat/completions use qwen3.6-plus, minimax-m2.7, glm-5.1, kimi-k2.6, big-pickle.',
  },
  cline: {
    label: 'Cline API',
    envKey: 'CLINE_API_KEY',
    baseUrl: 'https://api.cline.bot/api/v1',
    modelsUrl: 'https://api.cline.bot/api/v1/models',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    timeout: 120000,
    note: 'Cline is OpenAI-compatible chat/completions; use free model examples like minimax/minimax-m2.5',
  },
  groq: {
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    defaultModel: 'llama-3.3-70b-versatile',
    timeout: 60000,
    note: 'llama-3.1-8b-instant = fast/cheap, llama-3.3-70b-versatile = smarter',
  },
  xai: {
    label: 'xAI',
    envKey: 'XAI_API_KEY',
    baseUrl: 'https://api.x.ai/v1',
    modelsUrl: 'https://api.x.ai/v1/models',
    defaultModel: 'grok-4-mini',
    timeout: 60000,
    note: 'grok-4 = deep reasoning, grok-4-mini = fast',
  },
  mistral: {
    label: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    defaultModel: 'mistral-large-latest',
    defaultModelVerified: true,
    timeout: 60000,
    note: 'mistral-large-latest = flagship',
  },
  kilocode: {
    label: 'KiloCode',
    envKey: 'KILOCODE_API_KEY',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    modelsUrl: 'https://api.kilo.ai/api/gateway/models',
    defaultModel: 'kilo-pro/free',
    defaultModelVerified: true,
    supportsStreaming: true,
    timeout: 180000,
    note: 'KiloCode AI Gateway',
  },
  ollama: {
    label: 'Ollama (Local)',
    envKey: 'OLLAMA_API_KEY',
    baseUrl: 'http://localhost:11434/v1',
    modelsUrl: 'http://localhost:11434/v1/models',
    defaultModel: 'llama3.3',
    defaultModelVerified: true,
    isLocal: true,
    timeout: 300000,
    note: 'Local Ollama server',
  },
};

const PROVIDER_KEYS = Object.keys(PROVIDERS);
const CONFIG_PATH = join(getClewConfigHomeDir(), 'provider.json');

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveConfig(config: any) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('✅ Config saved to', CONFIG_PATH);
}

async function fetchModels(provider: string): Promise<string[]> {
  const p = PROVIDERS[provider];
  if (!p) return [];

  const config = loadConfig();
  const apiKey = config?.apiKeys?.[provider] || process.env[p.envKey] || readLocalProviderKey(provider);

  if (!apiKey && !p.isLocal) {
    if (p.defaultModelVerified && p.defaultModel) {
      console.log(`⚠️  No ${p.envKey} found. Using verified default model ${p.defaultModel}.`);
      return [p.defaultModel];
    }
    console.log(`⚠️  No ${p.envKey} found and no verified default model is available.`);
    return [];
  }

  try {
    const url = p.modelsUrl;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      if (provider === 'anthropic') {
        headers['x-api-key'] = apiKey;
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    const data = (await res.json()) as any;

    if (data.data && Array.isArray(data.data)) {
      return data.data.map((m: any) => m.id).filter(Boolean);
    } else if (data.models && Array.isArray(data.models)) {
      return data.models.map((m: any) => m.id || m.name).filter(Boolean);
    } else if (Array.isArray(data)) {
      return data.map((m: any) => m.id || m.name || m).filter(Boolean);
    }

    if (p.defaultModelVerified && p.defaultModel) {
      return [p.defaultModel];
    }
    return [];
  } catch (e) {
    console.log(`⚠️  Failed to fetch models: ${e}`);
    if (p.defaultModelVerified && p.defaultModel) {
      return [p.defaultModel];
    }
    return [];
  }
}

async function promptForModel(provider: string): Promise<string> {
  const p = PROVIDERS[provider];
  if (!p) return '';

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    readline.question(`\n🔧 Enter a model for ${p.label}: `, answer => {
      readline.close();
      resolve(answer.trim());
    });
  });
}

async function promptForApiKey(provider: string): Promise<string> {
  const p = PROVIDERS[provider];
  if (!p || p.isLocal) {
    return '';
  }

  const config = loadConfig();
  const hasExistingKey = Boolean(
    config?.apiKeys?.[provider] || process.env[p.envKey] || readLocalProviderKey(provider),
  );

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
    ? `\n🔑 Enter ${p.envKey} for ${p.label} (leave blank to keep existing): `
    : `\n🔑 Enter ${p.envKey} for ${p.label}: `;

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

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

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

async function selectProvider() {
  console.log('\n🚀 Clew Code - Provider & Model Selector\n');

  console.log('🌐 Available providers:');
  PROVIDER_KEYS.forEach((p, i) => {
    const info = PROVIDERS[p]!;
    console.log(`  ${i + 1}. ${info.label} ${info.isLocal ? '(Local)' : ''}`);
  });

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const provider = await new Promise<string>(resolve => {
    readline.question(`\n🔧 Select provider (1-${PROVIDER_KEYS.length}): `, answer => {
      readline.close();
      const idx = parseInt(answer, 10) - 1;
      resolve(PROVIDER_KEYS[idx] || PROVIDER_KEYS[0] || 'openai');
    });
  });

  console.log(`\n⏳ Fetching models from ${PROVIDERS[provider]!.label}...`);
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

  const apiKey = await promptForApiKey(provider);
  const currentConfig = loadConfig();
  const hasExistingKey = Boolean(
    currentConfig?.apiKeys?.[provider] || process.env[PROVIDERS[provider]!.envKey] || readLocalProviderKey(provider),
  );

  if (!PROVIDERS[provider]!.isLocal && !apiKey && !hasExistingKey) {
    console.log(`❌ No API key provided for ${PROVIDERS[provider]!.envKey}. Aborting.`);
    process.exit(1);
  }

  const apiKeys = {
    ...(currentConfig?.apiKeys || {}),
    ...(apiKey ? { [provider]: apiKey } : {}),
  };

  const config = {
    provider,
    model,
    providerConfig: PROVIDERS[provider],
    apiKeys,
  };

  return config;
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
    for (const [_key, info] of Object.entries(PROVIDERS)) {
      console.log(`🌐 ${info.label}:`);
      console.log(`   Default: ${info.defaultModel}`);
      console.log(`   Base:   ${info.baseUrl}`);
      console.log(`   Note:   ${info.note}`);
      console.log();
    }
    return;
  }

  if (options.models) {
    const provider = options.models.toLowerCase();
    if (!PROVIDERS[provider]) {
      console.log(`❌ Unknown provider: ${provider}`);
      console.log('Available:', Object.keys(PROVIDERS).join(', '));
      return;
    }
    console.log(`\n⏳ Fetching models from ${PROVIDERS[provider]!.label}...`);
    const models = await fetchModels(provider);
    console.log(`\n📋 Models from ${PROVIDERS[provider]!.label} (${models.length}):\n`);
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
    for (const [_key, info] of Object.entries(PROVIDERS)) {
      console.log(`🌐 ${info.label}:`);
      console.log(`   ${info.modelsUrl}`);
      console.log();
    }
    return;
  }

  if (options.reset) {
    const defaultConfig = {
      provider: 'openai',
      model: 'gpt-4.1-mini',
      providerConfig: PROVIDERS.openai,
    };
    saveConfig(defaultConfig);
    console.log('🔄 Reset to default:', defaultConfig);
    return;
  }

  if (options.get) {
    const config = loadConfig();
    if (config) {
      console.log('\n⚙️  Current configuration:\n');
      console.log(`  Provider: ${config.provider}`);
      console.log(`  Model:    ${config.model}`);
      console.log();
    } else {
      console.log('\n⚠️  No configuration found. Run with --set to configure.\n');
    }
    return;
  }

  if (options.set) {
    const config = await selectProvider();
    saveConfig(config);
    console.log('\n✅ Configuration updated!\n');
    console.log(`  Provider: ${config.provider}`);
    console.log(`  Model:    ${config.model}\n`);
    return;
  }

  const config = await selectProvider();
  saveConfig(config);
  console.log('\n✅ Configuration saved!\n');
  console.log(`  Provider: ${config.provider}`);
  console.log(`  Model:    ${config.model}\n`);
}
