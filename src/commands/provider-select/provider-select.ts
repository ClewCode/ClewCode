import ansis from 'ansis';
import { readFile, writeFile } from 'fs/promises';
import * as React from 'react';
import { ConsoleOAuthFlow } from '../../components/ConsoleOAuthFlow.js';
import { type OptionWithDescription, Select } from '../../components/CustomSelect/select.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { GoogleOAuthFlow } from '../../components/GoogleOAuthFlow.js';
import TextInput from '../../components/TextInput.js';
import { Box, Text } from '../../ink.js';
import {
  getEffectiveProviderConfigPath,
  getProjectProviderConfigPath,
  PROVIDER_CONFIG_PATH,
  ProviderManager,
} from '../../services/ai/ProviderManager.js';
import { clearProviderModelsCache, fetchProviderModels } from '../../services/ai/providerModels.js';
import {
  getProviderRegistryEntry,
  normalizeProviderId,
  PROVIDER_IDS,
  type ProviderRegistryEntry,
} from '../../services/ai/providerRegistry.js';
import { validateProviderModelSelection } from '../../services/ai/providerSelection.js';
import { hasGeminiOAuthCreds } from '../../services/ai/providers/CodeAssistProvider.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalCommandResult, LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { getClaudeAIOAuthTokens } from '../../utils/auth.js';
import { readLocalProviderKey } from '../../utils/localProviderKeys.js';

type SerializableProviderRegistryEntry = Omit<ProviderRegistryEntry, 'provider'>;

type ProviderConfig = {
  provider: (typeof PROVIDER_IDS)[number];
  model: string;
  apiKeys?: Partial<Record<(typeof PROVIDER_IDS)[number], string>>;
  providerConfig?: SerializableProviderRegistryEntry & {
    googleType?: 'direct' | 'vertex';
    openaiType?: 'direct' | 'azure';
  };
};

const PROVIDER_KEYS = PROVIDER_IDS;
type ProviderKey = (typeof PROVIDER_KEYS)[number];

// Expanded entries for providers with multiple auth methods (Anthropic, Google, OpenAI)
type ExpandedEntry = {
  providerId: ProviderKey;
  label: string;
  description: string;
  envKey: string;
  isLocal: boolean;
  authType?: 'direct' | 'vertex' | 'azure' | 'api-key' | 'oauth';
  value: string; // compound: "providerId:authType" or just "providerId"
};
type ProviderSelectValue = string | '__SECTION_RECENT__' | '__SECTION_PROVIDERS__';

function isProviderKey(provider: string): provider is ProviderKey {
  return PROVIDER_KEYS.includes(provider as ProviderKey);
}

/**
 * Resolve user-typed provider input (including legacy aliases like `gemini`)
 * to a registered provider key.
 */
function resolveProviderKey(input: string | undefined): ProviderKey | undefined {
  return normalizeProviderId(input) as ProviderKey | undefined;
}

function getProviderInfo(provider: ProviderKey): ProviderRegistryEntry {
  return getProviderRegistryEntry(provider);
}

function getSerializableProviderInfo(provider: ProviderKey): SerializableProviderRegistryEntry {
  const { provider: _provider, ...serializable } = getProviderInfo(provider);
  return serializable;
}

async function loadConfig(): Promise<ProviderConfig | null> {
  try {
    const configPath = getEffectiveProviderConfigPath();
    return JSON.parse(await readFile(configPath, 'utf8')) as ProviderConfig;
  } catch {
    return null;
  }
}

async function saveConfig(config: ProviderConfig): Promise<void> {
  const projectPath = getProjectProviderConfigPath();
  const savePath = projectPath ?? PROVIDER_CONFIG_PATH;
  await writeFile(savePath, JSON.stringify(config, null, 2));
}

function help(): string {
  return [
    'Usage:',
    '  /providers',
    '  /providers list',
    '  /providers key <provider> <api-key>',
    '  /providers set <provider> [model] [--global|-g]',
    '  /providers reset [--global|-g]',
    '  /providers models <provider>',
    '',
    'Flags:',
    '  --global, -g  Persist changes to the global config file (affects new sessions)',
    '',
    `Available providers: ${PROVIDER_KEYS.join(', ')}`,
  ].join('\n');
}

async function fetchModels(provider: ProviderKey): Promise<string[]> {
  return (await fetchModelInfos(provider)).map(model => model.id);
}

async function fetchModelInfos(
  provider: ProviderKey,
): Promise<Array<{ id: string; supportsToolCalling: boolean | undefined }>> {
  const models = await fetchProviderModels(provider);
  return models.map(model => ({
    id: model.id,
    supportsToolCalling: model.capabilities.toolCalling !== 'none',
  }));
}

async function providerList(): Promise<string> {
  const config = await loadConfig();
  const currentProvider = ProviderManager.getInstance().getActiveProviderName();

  const entries = PROVIDER_KEYS.map(provider => {
    const info = getProviderInfo(provider);
    const hasKey = Boolean(config?.apiKeys?.[provider] || process.env[info.envKey] || readLocalProviderKey(provider));
    const isActive = provider === currentProvider;

    return [
      `${isActive ? ansis.bold.green('●') : ' '} ${provider} (${info.label})${isActive ? ansis.dim(' (active)') : ''}`,
      `    key: ${hasKey ? ansis.green('saved') : info.isLocal ? ansis.dim('not required') : ansis.yellow(`missing ${info.envKey}`)}`,
    ].join('\n');
  });

  return [
    'Available Providers:',
    '',
    ...entries,
    '',
    'Use /providers set <provider> to switch.',
    'Use /providers models <provider> to see available models.',
  ].join('\n');
}

type ProviderCommandRunResult = {
  result: LocalCommandResult;
  appliedConfig?: ProviderConfig;
};

function getDefaultModelForProvider(provider: ProviderKey): string {
  return getProviderInfo(provider).defaultModel ?? '';
}

function applyProviderSelectionToSession(
  setAppState: ReturnType<typeof useSetAppState>,
  config: Pick<ProviderConfig, 'model' | 'provider' | 'apiKeys'>,
  isGlobal = false,
): void {
  // Session model & provider are managed by AppState's *ForSession fields
  // (mainLoopModelForSession / mainLoopProviderForSession). onChangeAppState
  // syncs these from the session's own AppState into the query pipeline.
  // ProviderManager is a process-global singleton — calling
  // setSessionModel/setSessionProvider here leaks the override into every other
  // in-process session (agents, bg tasks). Session-scoped API keys are okay
  // since they're just copied into fetch headers, not read by other sessions.
  const providerManager = ProviderManager.getInstance();

  if (config.apiKeys) {
    providerManager.setSessionApiKeys(config.apiKeys);
  }

  // Session-only: don't persist provider/model to provider.json.
  // Only --global (handled in runProviderCommand) writes the config file.
  // Always persist the model to settings so it survives across sessions.
  // Non-global changes must NOT touch mainLoopModel — mutating it triggers
  // onChangeAppState's persistence to userSettings + provider.json, which
  // leaks the change into every other running session via their settings
  // watchers. Session-scoped switches live only in *ForSession fields.
  setAppState(prev => ({
    ...prev,
    mainLoopModel: isGlobal ? config.model || prev.mainLoopModel : prev.mainLoopModel,
    mainLoopModelForSession: isGlobal ? null : config.model,
    mainLoopProvider: isGlobal ? config.provider : prev.mainLoopProvider,
    mainLoopProviderForSession: isGlobal ? null : config.provider,
  }));
}

async function runProviderCommand(args: string): Promise<ProviderCommandRunResult> {
  const parts = args.trim() ? args.trim().split(/\s+/) : [];
  const [subcommand = 'get', providerArg, ...modelParts] = parts;
  const command = subcommand.toLowerCase();

  if (command === 'help' || command === '--help' || command === '-h') {
    return { result: { type: 'text', value: help() } };
  }

  if (command === 'list' || command === '--list' || command === '-l') {
    return { result: { type: 'text', value: await providerList() } };
  }

  if (command === 'get' || command === '--get' || command === '-g') {
    const config = await loadConfig();
    if (!config) {
      return {
        result: {
          type: 'text',
          value: `No provider configuration found.\n\n${help()}`,
        },
      };
    }
    const currentPath = getEffectiveProviderConfigPath();
    return {
      result: {
        type: 'text',
        value: `Current provider: ${config.provider}\nCurrent model: ${config.model}\nSaved API keys: ${Object.keys(config.apiKeys ?? {}).join(', ') || 'none'}\nConfig: ${currentPath}`,
      },
    };
  }

  if (command === 'key') {
    const provider = resolveProviderKey(providerArg);
    if (!provider) {
      return {
        result: {
          type: 'text',
          value: `Unknown provider: ${provider ?? '(missing)'}\n\n${help()}`,
        },
      };
    }
    const setIndex = modelParts.findIndex(part => part.toLowerCase() === 'set');
    const apiKeyParts = setIndex === -1 ? modelParts : modelParts.slice(0, setIndex);
    const apiKey = apiKeyParts.join(' ');
    if (!apiKey) {
      return {
        result: {
          type: 'text',
          value: `Missing API key.\n\nUsage: /providers key ${provider} <api-key>`,
        },
      };
    }
    const setParts = setIndex === -1 ? [] : modelParts.slice(setIndex + 1);
    const setProvider = resolveProviderKey(setParts[0]);
    const setModel = setParts.slice(1).join(' ');
    if (setParts.length > 0 && !setProvider) {
      return {
        result: {
          type: 'text',
          value: `Unknown provider in set: ${setParts[0] ?? '(missing)'}`,
        },
      };
    }

    const isGlobal = modelParts.includes('--global') || modelParts.includes('-g');
    const currentConfig = await loadConfig();
    const nextProvider = (setProvider ?? currentConfig?.provider ?? provider) as ProviderKey;
    const nextModel =
      setModel ||
      (nextProvider === currentConfig?.provider ? currentConfig?.model : getDefaultModelForProvider(nextProvider)) ||
      getDefaultModelForProvider(nextProvider);
    const nextConfig: ProviderConfig = {
      provider: nextProvider,
      model: nextModel,
      providerConfig:
        getSerializableProviderInfo(nextProvider) ??
        currentConfig?.providerConfig ??
        getSerializableProviderInfo(provider),
      apiKeys: {
        ...(currentConfig?.apiKeys ?? {}),
        [provider]: apiKey,
      },
    };

    if (isGlobal) {
      await saveConfig(nextConfig);
    }

    clearProviderModelsCache(nextProvider);

    const currentPath = getEffectiveProviderConfigPath();
    return {
      result: {
        type: 'text',
        value: setProvider
          ? `Saved API key for ${provider}\nSet provider to ${nextProvider}\nSet model to ${nextModel}${isGlobal ? `\nConfig saved: ${currentPath}` : '\n(Session only)'}`
          : `Saved API key for ${provider} ${isGlobal ? `to ${currentPath}` : '(Session only)'}`,
      },
      appliedConfig: setProvider ? nextConfig : undefined,
    };
  }

  if (command === 'reset' || command === '--reset' || command === '-r') {
    const isGlobal = modelParts.includes('--global') || modelParts.includes('-g');
    const currentConfig = await loadConfig();
    const defaultProviderInfo = getSerializableProviderInfo('openai');
    const config: ProviderConfig = {
      provider: 'openai',
      model: defaultProviderInfo.defaultModel ?? '',
      providerConfig: defaultProviderInfo,
      apiKeys: currentConfig?.apiKeys,
    };

    if (isGlobal) {
      await saveConfig(config);
    }

    clearProviderModelsCache(config.provider);
    const currentPath = getEffectiveProviderConfigPath();
    return {
      result: {
        type: 'text',
        value: `Reset provider to ${config.provider} (${config.model})${isGlobal ? `\nConfig saved: ${currentPath}` : '\n(Session only)'}`,
      },
      appliedConfig: config,
    };
  }

  if (command === 'set' || command === '--set' || command === '-s') {
    const provider = resolveProviderKey(providerArg);
    if (!provider) {
      return {
        result: {
          type: 'text',
          value: `Unknown provider: ${provider ?? '(missing)'}\n\n${help()}`,
        },
      };
    }

    const isGlobal = modelParts.includes('--global') || modelParts.includes('-g');
    const actualModelParts = modelParts.filter(p => p !== '--global' && p !== '-g');

    let model = actualModelParts.join(' ');
    if (!model) {
      try {
        model = (await fetchModels(provider))[0] ?? '';
      } catch {
        model = '';
      }
    }
    if (!model) {
      return {
        result: {
          type: 'text',
          value: `No model was provided and ${getProviderInfo(provider).label} did not return models from its API.`,
        },
      };
    }
    if (actualModelParts.length > 0) {
      const validation = await validateProviderModelSelection(provider, model);
      if (!validation.valid) {
        const suggestions = validation.suggestions?.length
          ? `\nAvailable models: ${validation.suggestions.join(', ')}`
          : '';
        return {
          result: {
            type: 'text',
            value: `${validation.error}${suggestions}\n\nUse /providers models ${provider} to list available models.`,
          },
        };
      }
      model = validation.model ?? model;
    }
    const currentConfig = await loadConfig();
    const config: ProviderConfig = {
      provider,
      model,
      providerConfig: getSerializableProviderInfo(provider),
      apiKeys: currentConfig?.apiKeys,
    };

    if (isGlobal) {
      await saveConfig(config);
    }

    clearProviderModelsCache(provider);

    const currentPath = getEffectiveProviderConfigPath();
    return {
      result: {
        type: 'text',
        value: `Set provider to ${provider}\nSet model to ${model}${isGlobal ? `\nConfig saved: ${currentPath}` : '\n(Session only)'}`,
      },
      appliedConfig: config,
    };
  }

  if (command === 'models' || command === '--models' || command === '-m') {
    const provider = resolveProviderKey(providerArg);
    if (!provider) {
      return {
        result: {
          type: 'text',
          value: `Unknown provider: ${provider ?? '(missing)'}\n\n${help()}`,
        },
      };
    }

    try {
      const models = await fetchModelInfos(provider);
      const visible = models
        .slice(0, 30)
        .map(model => `${model.id}${model.supportsToolCalling === false ? ' (no tools)' : ''}`)
        .join('\n');
      const suffix = models.length > 30 ? `\n... and ${models.length - 30} more` : '';
      return {
        result: {
          type: 'text',
          value: `Models from ${getProviderInfo(provider).label}:\n${visible || '(none returned)'}${suffix}`,
        },
      };
    } catch (error) {
      return {
        result: {
          type: 'text',
          value: `Failed to fetch models: ${(error as Error).message}`,
        },
      };
    }
  }

  return {
    result: {
      type: 'text',
      value: `Unknown provider command: ${subcommand}\n\n${help()}`,
    },
  };
}

function ProviderPicker({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const [provider, setProvider] = React.useState<ProviderKey | null>(null);
  const [apiKeyInput, setApiKeyInput] = React.useState('');
  const [apiKeyCursorOffset, setApiKeyCursorOffset] = React.useState(0);
  const [apiKeyError, setApiKeyError] = React.useState<string | null>(null);
  const [config, setConfig] = React.useState<ProviderConfig | null>(null);
  const [showChangeKey, setShowChangeKey] = React.useState(false);
  const [anthropicType, setAnthropicType] = React.useState<'api-key' | 'oauth' | null>(null);
  const [showAnthropicOAuthLogin, setShowAnthropicOAuthLogin] = React.useState(false);
  const [showCodeAssistLogin, setShowCodeAssistLogin] = React.useState(false);
  const [googleType, setGoogleType] = React.useState<'direct' | 'vertex' | null>(null);
  const [openaiType, setOpenaiType] = React.useState<'direct' | 'azure' | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchCursorOffset, setSearchCursorOffset] = React.useState(0);
  const [customName, setCustomName] = React.useState('');
  const [customBaseUrl, setCustomBaseUrl] = React.useState('');
  const [customModel, setCustomModel] = React.useState('');
  const [customStep, setCustomStep] = React.useState<'name' | 'baseUrl' | 'apiKey' | 'model' | null>(null);
  const [customCursorOffset, setCustomCursorOffset] = React.useState(0);
  const setAppState = useSetAppState();
  const currentSessionModel = useAppState(s => (s.mainLoopModelForSession || s.mainLoopModel) as string | null);

  const info = provider ? getProviderInfo(provider) : null;
  const hasExistingKey =
    provider && info ? Boolean(config?.apiKeys?.[provider] || (info.envKey ? process.env[info.envKey] : false)) : false;

  React.useEffect(() => {
    void loadConfig().then(loadedConfig => {
      setConfig(loadedConfig);
      if (loadedConfig?.provider === 'google' && (loadedConfig.providerConfig as any)?.googleType) {
        const type = (loadedConfig.providerConfig as any).googleType;
        setGoogleType(type === 'vertex' ? 'vertex' : 'direct');
      }
      if (loadedConfig?.provider === 'openai' && (loadedConfig.providerConfig as any)?.openaiType) {
        const type = (loadedConfig.providerConfig as any).openaiType;
        setOpenaiType(type === 'azure' ? 'azure' : 'direct');
      }
    });
  }, []);

  async function saveProviderSelection(apiKey?: string) {
    if (!provider) return;

    const trimmedApiKey = apiKey?.trim();
    const nextApiKeys: ProviderConfig['apiKeys'] = {
      ...(config?.apiKeys ?? {}),
      ...(trimmedApiKey ? { [provider]: trimmedApiKey } : {}),
    };
    if (provider === 'anthropic' && anthropicType === 'oauth') {
      delete nextApiKeys?.anthropic;
    }

    const info = getProviderInfo(provider);
    // Preserve existing provider/model in the config file so other
    // sessions keep using their own selection. Only the API key is
    // persisted; the new provider+model are applied to this session
    // via applyProviderSelectionToSession further down.
    const existingConfig = await loadConfig();
    const nextConfig: ProviderConfig = {
      provider: existingConfig?.provider || provider,
      model: existingConfig?.model || (currentSessionModel as string) || info.defaultModel || '',
      providerConfig: {
        ...getSerializableProviderInfo(provider),
        ...(provider === 'google' ? { googleType: googleType ?? 'direct' } : {}),
        ...(provider === 'openai' ? { openaiType: openaiType ?? 'direct' } : {}),
        // Store the value from prompt if needed
        ...(provider === 'openai' && openaiType === 'azure' && apiKey ? { baseUrl: apiKey } : {}),
        ...(provider === 'google' && googleType === 'vertex' && apiKey ? { projectId: apiKey } : {}),
      } as any,
      apiKeys: nextApiKeys,
    };

    await saveConfig(nextConfig);
    clearProviderModelsCache(provider);

    // Invalidate provider config cache to force reload
    const providerManager = ProviderManager.getInstance();
    providerManager.invalidateConfigCache();

    const isProviderSwitching = existingConfig && existingConfig.provider !== provider;
    const currentModel = isProviderSwitching
      ? info.defaultModel || ''
      : existingConfig?.model || (currentSessionModel as string) || info.defaultModel || '';
    applyProviderSelectionToSession(setAppState, { model: currentModel, provider }, false);

    onDone(`Set provider to ${provider}\nModel: ${currentModel}\n(Session only)`, { display: 'system' });
  }

  // Build expanded list: providers with multiple auth methods get separate entries
  const EXPANDED_ENTRIES: ExpandedEntry[] = [
    // Anthropic variants
    {
      providerId: 'anthropic',
      label: 'Anthropic (API Key)',
      authType: 'api-key',
      envKey: 'ANTHROPIC_API_KEY',
      isLocal: false,
      description: 'Use ANTHROPIC_API_KEY',
      value: 'anthropic:api-key',
    },
    {
      providerId: 'anthropic',
      label: 'Anthropic (OAuth)',
      authType: 'oauth',
      envKey: '',
      isLocal: false,
      description: 'Sign in with a Claude subscription',
      value: 'anthropic:oauth',
    },
    // Google variants
    {
      providerId: 'google',
      label: 'Google (API Key)',
      authType: 'direct',
      envKey: 'GOOGLE_API_KEY',
      isLocal: false,
      description: 'Use GOOGLE_API_KEY',
      value: 'google:direct',
    },
    {
      providerId: 'google',
      label: 'Google Vertex AI',
      authType: 'vertex',
      envKey: '',
      isLocal: false,
      description: 'GCP credentials',
      value: 'google:vertex',
    },
    // OpenAI variants
    {
      providerId: 'openai',
      label: 'OpenAI (API Key)',
      authType: 'direct',
      envKey: 'OPENAI_API_KEY',
      isLocal: false,
      description: 'Use OPENAI_API_KEY',
      value: 'openai:direct',
    },
    {
      providerId: 'openai',
      label: 'Azure OpenAI',
      authType: 'azure',
      envKey: 'AZURE_API_KEY',
      isLocal: false,
      description: 'Azure OpenAI endpoint',
      value: 'openai:azure',
    },
  ];
  const expandedMap = new Map(EXPANDED_ENTRIES.map(e => [e.value, e]));

  function buildAllEntries(): ExpandedEntry[] {
    const entries: ExpandedEntry[] = [];
    for (const k of PROVIDER_KEYS) {
      if (k === 'anthropic' || k === 'google' || k === 'openai') continue; // handled by expanded entries
      const info = getProviderInfo(k);
      entries.push({
        providerId: k as ProviderKey,
        label: info.label,
        authType: undefined as any,
        envKey: info.envKey,
        isLocal: info.isLocal ?? false,
        description: info.note ?? '',
        value: k,
      });
    }
    entries.push(...EXPANDED_ENTRIES);
    return entries;
  }

  if (!provider) {
    const activeProvider = ProviderManager.getInstance().getActiveProviderName();
    const recentProviders = [activeProvider, config?.provider].filter(
      (key, index, keys): key is ProviderKey =>
        typeof key === 'string' && isProviderKey(key) && keys.indexOf(key) === index,
    );

    // Build expanded entries list (one per auth method for Google/OpenAI)
    const allEntries = buildAllEntries();

    function createEntryOption(entry: ExpandedEntry): OptionWithDescription<ProviderSelectValue> {
      const hasKey =
        entry.providerId === 'anthropic' && entry.authType === 'oauth'
          ? Boolean(getClaudeAIOAuthTokens()?.accessToken)
          : entry.isLocal && !entry.envKey
            ? true
            : Boolean(config?.apiKeys?.[entry.providerId] || process.env[entry.envKey]);
      const missingStatus =
        entry.providerId === 'anthropic' && entry.authType === 'oauth'
          ? 'sign in required'
          : `${entry.envKey} - MISSING`;
      const status = hasKey ? ansis.green('configured') : entry.isLocal ? 'not required' : missingStatus;
      const markers = [entry.providerId === activeProvider ? ansis.green('current') : null].filter(Boolean);
      return {
        label: entry.label,
        value: entry.value,
        description: markers.length > 0 ? `${status} - ${markers.join(', ')}` : status,
      };
    }

    const query = searchQuery.trim();
    const filteredEntries = query
      ? allEntries.filter(e => e.label.toLowerCase().includes(query) || e.providerId.includes(query))
      : allEntries;
    const filteredEntrySet = new Set(filteredEntries.map(e => e.value));
    const visibleRecent = recentProviders.filter(r => filteredEntrySet.has(r));
    const remainingEntries = filteredEntries.filter(e => !visibleRecent.includes(e.providerId as any));
    const options: Array<OptionWithDescription<ProviderSelectValue>> = query
      ? filteredEntries.map(createEntryOption)
      : [
          ...(visibleRecent.length > 0
            ? [
                {
                  label: 'Recent',
                  value: '__SECTION_RECENT__',
                  description: '',
                  type: 'section',
                  disabled: true,
                } as const,
                ...visibleRecent.map(r => {
                  const info = getProviderInfo(r);
                  return {
                    label: info.label,
                    value: r,
                    description: 'current',
                  } as OptionWithDescription<ProviderSelectValue>;
                }),
              ]
            : []),
          { label: 'Providers', value: '__SECTION_PROVIDERS__', description: '', type: 'section', disabled: true },
          ...remainingEntries.map(createEntryOption),
        ];

    return React.createElement(
      Dialog,
      {
        title: 'AI Providers',
        subtitle: 'Select active provider for the session and configure credentials',
        onCancel: () => {
          setSearchQuery('');
          setSearchCursorOffset(0);
          onDone('Provider selection cancelled', { display: 'system' });
        },
        isCancelActive: !searchQuery,
        hideInputGuide: true,
      },
      React.createElement(
        Box,
        { flexDirection: 'column' },
        React.createElement(TextInput, {
          value: searchQuery,
          onChange: value => {
            setSearchQuery(value);
            setSearchCursorOffset(value.length);
          },
          onSubmit: () => {
            // Enter on search input moves to selection
          },
          onExit: () => {
            setSearchQuery('');
            setSearchCursorOffset(0);
            onDone('Provider selection cancelled', { display: 'system' });
          },
          placeholder: 'Search providers... (type to filter)',
          focus: true,
          showCursor: true,
          columns: 50,
          cursorOffset: searchCursorOffset,
          onChangeCursorOffset: setSearchCursorOffset,
        }),
        React.createElement(Box, { marginTop: 1 }),
        React.createElement(Select, {
          options,
          visibleOptionCount: query ? 10 : 12,
          highlightText: searchQuery,
          onChange: value => {
            if (value === '__SECTION_RECENT__' || value === '__SECTION_PROVIDERS__') {
              return;
            }
            // Parse expanded value (e.g. "google:vertex" -> provider=google, authType=vertex)
            const expanded = expandedMap.get(value);
            if (expanded) {
              setProvider(expanded.providerId);
              if (expanded.authType) {
                if (expanded.providerId === 'anthropic') {
                  setAnthropicType(expanded.authType as 'api-key' | 'oauth');
                }
                if (expanded.providerId === 'google') {
                  setGoogleType(expanded.authType as any);
                }
                if (expanded.providerId === 'openai') {
                  setOpenaiType(expanded.authType as any);
                }
              }
            } else {
              setProvider(value as ProviderKey);
            }
            setApiKeyInput('');
            setApiKeyCursorOffset(0);
            setApiKeyError(null);
            setSearchQuery('');
            setSearchCursorOffset(0);
          },
          onCancel: () => {
            setShowChangeKey(false);
            setSearchQuery('');
            setSearchCursorOffset(0);
            onDone('Provider selection cancelled', { display: 'system' });
          },
        }),
      ),
    );
  }

  // Custom provider flow: prompt for name, URL, key, model
  if (provider === 'custom' && !customStep) {
    setCustomStep('name');
    setCustomCursorOffset(0);
  }

  if (provider === 'custom' && customStep) {
    const stepLabel =
      customStep === 'name'
        ? `Provider label (e.g. "My LLM")`
        : customStep === 'baseUrl'
          ? `Base URL (e.g. https://api.example.com/v1)`
          : customStep === 'apiKey'
            ? `API Key (optional, press Enter to skip)`
            : `Model name (e.g. gpt-4o)`;

    const stepValue =
      customStep === 'name'
        ? customName
        : customStep === 'baseUrl'
          ? customBaseUrl
          : customStep === 'model'
            ? customModel
            : apiKeyInput;

    const stepOnChange =
      customStep === 'name'
        ? (v: string) => {
            setCustomName(v);
          }
        : customStep === 'baseUrl'
          ? (v: string) => {
              setCustomBaseUrl(v);
            }
          : customStep === 'model'
            ? (v: string) => {
                setCustomModel(v);
              }
            : (v: string) => {
                setApiKeyInput(v);
                setApiKeyError(null);
              };

    const advanceStep = async (value: string) => {
      const trimmed = value.trim();
      if (customStep === 'name') {
        setCustomName(trimmed);
        if (!trimmed) return;
        setCustomStep('baseUrl');
        setCustomCursorOffset(0);
      } else if (customStep === 'baseUrl') {
        setCustomBaseUrl(trimmed);
        if (!trimmed) return;
        setCustomStep('apiKey');
        setCustomCursorOffset(0);
      } else if (customStep === 'apiKey') {
        setCustomStep('model');
        setCustomCursorOffset(0);
      } else if (customStep === 'model') {
        let model = trimmed;
        let fetchedMsg = '';

        // If model is empty, try to auto-fetch from /models endpoint
        if (!model) {
          const label = customName || 'Custom';
          const baseUrl = customBaseUrl;
          const apiKeyVal = apiKeyInput.trim();

          // Temporarily set the provider config so fetchProviderModels can use it
          const currentConfig = await loadConfig();
          const tempConfig: ProviderConfig = {
            provider: 'custom',
            model: '',
            providerConfig: {
              ...(getSerializableProviderInfo('custom') as any),
              providerId: 'custom',
              label,
              envKey: 'CUSTOM_API_KEY',
              baseUrl,
            } as any,
            apiKeys: {
              ...(currentConfig?.apiKeys ?? {}),
              ...(apiKeyVal ? { custom: apiKeyVal } : {}),
            },
          };
          await saveConfig(tempConfig);
          const providerManager = ProviderManager.getInstance();
          providerManager.invalidateConfigCache();

          try {
            const fetched = await fetchProviderModels('custom');
            if (fetched && fetched.length > 0) {
              model = fetched[0].id;
              fetchedMsg = `\nAuto-detected ${fetched.length} model(s) from API`;
            }
          } catch {
            fetchedMsg = '\nCould not auto-detect models from API';
          }
        }

        if (!model) return; // still no model after fetch

        const label = customName || 'Custom';
        const baseUrl = customBaseUrl;
        const apiKeyVal = apiKeyInput.trim();

        const currentConfig = await loadConfig();
        const nextConfig: ProviderConfig = {
          provider: 'custom',
          model,
          providerConfig: {
            ...(getSerializableProviderInfo('custom') as any),
            providerId: 'custom',
            label,
            envKey: 'CUSTOM_API_KEY',
            baseUrl,
          } as any,
          apiKeys: {
            ...(currentConfig?.apiKeys ?? {}),
            ...(apiKeyVal ? { custom: apiKeyVal } : {}),
          },
        };

        await saveConfig(nextConfig);
        clearProviderModelsCache('custom');

        const providerManager = ProviderManager.getInstance();
        providerManager.invalidateConfigCache();
        applyProviderSelectionToSession(setAppState, { model, provider: 'custom' }, false);

        setCustomName('');
        setCustomBaseUrl('');
        setCustomModel('');
        setCustomStep(null);
        setApiKeyInput('');
        setApiKeyCursorOffset(0);

        onDone(
          `Set provider to Custom (${label})\nBase URL: ${baseUrl}\nModel: ${model}${fetchedMsg}\n(Session only)`,
          {
            display: 'system',
          },
        );
      }
    };

    const cancelCustom = () => {
      setCustomName('');
      setCustomBaseUrl('');
      setCustomModel('');
      setCustomStep(null);
      setApiKeyInput('');
      setApiKeyCursorOffset(0);
      setApiKeyError(null);
      setProvider(null);
      setSearchQuery('');
      setSearchCursorOffset(0);
    };

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { marginBottom: 1 },
        `Custom Provider — Step ${customStep === 'name' ? '1/4' : customStep === 'baseUrl' ? '2/4' : customStep === 'apiKey' ? '3/4' : '4/4'}: ${stepLabel}`,
      ),
      apiKeyError ? React.createElement(Text, { color: 'error', marginBottom: 1 }, apiKeyError) : null,
      React.createElement(TextInput, {
        value: stepValue,
        onChange: stepOnChange,
        onSubmit: value => {
          void advanceStep(value);
        },
        onExit: cancelCustom,
        placeholder: stepLabel,
        mask: customStep === 'apiKey' ? '*' : undefined,
        focus: true,
        showCursor: true,
        columns: 80,
        cursorOffset: customCursorOffset,
        onChangeCursorOffset: setCustomCursorOffset,
      }),
    );
  }

  // Google/OpenAI auth types are now selected directly from the expanded provider list
  // (e.g. "Google (API Key)", "Google Vertex AI", "OpenAI (API Key)", etc.)
  // No sub-menu needed here -- authType is set by the list selection handler above.

  if (provider === 'anthropic' && anthropicType === 'oauth') {
    const hasOAuthCredentials = Boolean(getClaudeAIOAuthTokens()?.accessToken);
    if (hasOAuthCredentials && !showAnthropicOAuthLogin) {
      return React.createElement(
        Dialog,
        {
          title: 'Anthropic OAuth',
          subtitle: 'OAuth credentials are already configured',
          onCancel: () => {
            setProvider(null);
            setAnthropicType(null);
          },
        },
        React.createElement(Select, {
          options: [
            {
              label: 'Use existing OAuth login',
              value: 'use_existing',
              description: 'Keep the saved Anthropic credentials',
            },
            {
              label: 'Sign in again',
              value: 'sign_in_again',
              description: 'Replace the saved Anthropic credentials',
            },
          ],
          visibleOptionCount: 2,
          onChange: value => {
            if (value === 'sign_in_again') {
              setShowAnthropicOAuthLogin(true);
            } else {
              void saveProviderSelection();
            }
          },
          onCancel: () => {
            setProvider(null);
            setAnthropicType(null);
          },
        }),
      );
    }

    return React.createElement(
      Dialog,
      {
        title: 'Anthropic OAuth',
        subtitle: 'Sign in with your Claude subscription',
        onCancel: () => {
          setProvider(null);
          setAnthropicType(null);
          setShowAnthropicOAuthLogin(false);
        },
      },
      React.createElement(ConsoleOAuthFlow, {
        forceLoginMethod: 'claudeai',
        onDone: () => {
          setShowAnthropicOAuthLogin(false);
          void saveProviderSelection();
        },
      }),
    );
  }

  // Gemini Code Assist (OAuth): browser login using the Gemini CLI's public
  // client + cloud-platform scopes; tokens go to ~/.gemini/oauth_creds.json.
  // Skip the prompt when creds already exist unless the user asks to re-login.
  if (provider === 'google-assist') {
    const hasCreds = hasGeminiOAuthCreds();
    if (hasCreds && !showCodeAssistLogin) {
      return React.createElement(
        Dialog,
        {
          title: 'Gemini Code Assist (OAuth)',
          subtitle: 'Google credentials are already configured (~/.gemini/oauth_creds.json)',
          onCancel: () => {
            setProvider(null);
          },
        },
        React.createElement(Select, {
          options: [
            { label: 'Use existing login', value: 'use_existing', description: 'Keep the saved Google credentials' },
            { label: 'Sign in again', value: 'sign_in_again', description: 'Replace the saved Google credentials' },
          ],
          visibleOptionCount: 2,
          onChange: (value: string) => {
            if (value === 'sign_in_again') {
              setShowCodeAssistLogin(true);
            } else {
              void saveProviderSelection();
            }
          },
          onCancel: () => {
            setProvider(null);
          },
        }),
      );
    }

    return React.createElement(
      Dialog,
      {
        title: 'Gemini Code Assist (OAuth)',
        subtitle: 'Sign in with your Google account',
        onCancel: () => {
          setProvider(null);
          setShowCodeAssistLogin(false);
        },
      },
      React.createElement(GoogleOAuthFlow, {
        codeAssist: true,
        onDone: () => {
          setShowCodeAssistLogin(false);
          void saveProviderSelection();
        },
        onCancel: () => {
          setProvider(null);
          setShowCodeAssistLogin(false);
        },
      }),
    );
  }

  // Show input field when: (no existing key) OR (user chose to change key)
  if ((!hasExistingKey && !info.isLocal) || (showChangeKey && !info.isLocal)) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { marginBottom: 1 },
        showChangeKey
          ? `Enter new ${info.envKey} for ${info.label}`
          : googleType === 'vertex'
            ? `Enter Google Cloud Project ID for Vertex AI (or press Enter to use GCLOUD_PROJECT env)`
            : openaiType === 'azure'
              ? `Enter Azure OpenAI Endpoint URL (e.g. https://res-name.openai.azure.com/)`
              : `API key required for ${info.label} (${info.envKey})`,
      ),
      apiKeyError ? React.createElement(Text, { color: 'error', marginBottom: 1 }, apiKeyError) : null,
      React.createElement(TextInput, {
        value: apiKeyInput,
        onChange: value => {
          setApiKeyInput(value);
          setApiKeyError(null);
        },
        onSubmit: async value => {
          const trimmed = value.trim();
          const needsKey = provider !== 'google' || googleType !== 'vertex';

          if (!trimmed && needsKey) {
            setApiKeyError(`Enter ${info.envKey} or cancel to go back.`);
            return;
          }
          await saveProviderSelection(trimmed);
        },
        onExit: () => {
          setProvider(null);
          setApiKeyInput('');
          setApiKeyCursorOffset(0);
          setApiKeyError(null);
          setShowChangeKey(false);
          setAnthropicType(null);
          setGoogleType(null);
          setOpenaiType(null);
          setSearchQuery('');
          setSearchCursorOffset(0);
        },
        placeholder: `Paste ${info.envKey}`,
        mask: '*',
        focus: true,
        showCursor: true,
        columns: 80,
        cursorOffset: apiKeyCursorOffset,
        onChangeCursorOffset: setApiKeyCursorOffset,
      }),
    );
  }

  // Provider has existing key - show options to use existing or change
  if (hasExistingKey && !info.isLocal && !showChangeKey) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(Text, { marginBottom: 1 }, `${info.label} has an API key configured (${info.envKey})`),
      React.createElement(Select, {
        options: [
          {
            label: 'Use existing key',
            value: 'use_existing',
            description: `Keep current ${info.envKey}`,
          },
          {
            label: 'Change key',
            value: 'change_key',
            description: `Enter new ${info.envKey}`,
          },
        ],
        visibleOptionCount: 2,
        onChange: value => {
          if (value === 'change_key') {
            setShowChangeKey(true);
          } else {
            void saveProviderSelection();
          }
        },
        onCancel: () => {
          setProvider(null);
          setShowChangeKey(false);
          setAnthropicType(null);
          setSearchQuery('');
          setSearchCursorOffset(0);
        },
      }),
    );
  }

  void saveProviderSelection();
  return null;
}

function ProviderCommandRunner({ args, onDone }: { args: string; onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const setAppState = useSetAppState();

  React.useEffect(() => {
    void runProviderCommand(args)
      .then(({ result, appliedConfig }) => {
        if (appliedConfig) {
          const parts = args.trim().split(/\s+/);
          const isGlobal = parts.includes('--global') || parts.includes('-g');
          applyProviderSelectionToSession(setAppState, appliedConfig, isGlobal);
        }
        if (result.type === 'text') {
          onDone(result.value);
        } else {
          onDone(undefined, { display: 'skip' });
        }
      })
      .catch(err => {
        onDone(`Provider command failed: ${(err as Error).message}`, {
          display: 'system',
        });
      });
  }, [args, onDone, setAppState]);

  return null;
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  if (args.trim()) {
    return React.createElement(ProviderCommandRunner, { args, onDone });
  }

  return React.createElement(ProviderPicker, { onDone });
};
