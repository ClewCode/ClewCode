import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import chalk from 'chalk'
import * as React from 'react'
import { Select } from '../../components/CustomSelect/select.js'
import TextInput from '../../components/TextInput.js'
import { Box, Text } from '../../ink.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type {
  LocalCommandResult,
  LocalJSXCommandCall,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import {
  PROVIDER_IDS,
  getProviderRegistryEntry,
  type ProviderRegistryEntry,
} from '../../services/ai/providerRegistry.js'
import { clearProviderModelsCache, fetchProviderModels } from '../../services/ai/providerModels.js'
import { ProviderManager, getProjectProviderConfigPath, getEffectiveProviderConfigPath, PROVIDER_CONFIG_PATH } from '../../services/ai/ProviderManager.js'

type SerializableProviderRegistryEntry = Omit<ProviderRegistryEntry, 'provider'>

type ProviderConfig = {
  provider: typeof PROVIDER_IDS[number]
  model: string
  apiKeys?: Partial<Record<typeof PROVIDER_IDS[number], string>>
  providerConfig?: SerializableProviderRegistryEntry & { 
    anthropicType?: 'direct' | 'bedrock' | 'vertex' | 'foundry' | 'subscriber',
    googleType?: 'direct' | 'vertex',
    openaiType?: 'direct' | 'subscriber' | 'azure'
  }
}

const PROVIDER_KEYS = PROVIDER_IDS

type ProviderKey = (typeof PROVIDER_KEYS)[number]

function isProviderKey(provider: string): provider is ProviderKey {
  return PROVIDER_KEYS.includes(provider as ProviderKey)
}

function getProviderInfo(provider: ProviderKey): ProviderRegistryEntry {
  return getProviderRegistryEntry(provider)
}

function getSerializableProviderInfo(
  provider: ProviderKey,
): SerializableProviderRegistryEntry {
  const { provider: _provider, ...serializable } = getProviderInfo(provider)
  return serializable
}

async function loadConfig(): Promise<ProviderConfig | null> {
  try {
    const configPath = getEffectiveProviderConfigPath()
    return JSON.parse(await readFile(configPath, 'utf8')) as ProviderConfig
  } catch {
    return null
  }
}

async function saveConfig(config: ProviderConfig): Promise<void> {
  const projectPath = getProjectProviderConfigPath()
  const savePath = projectPath ?? PROVIDER_CONFIG_PATH
  await writeFile(savePath, JSON.stringify(config, null, 2))
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
  ].join('\n')
}

async function fetchModels(provider: ProviderKey): Promise<string[]> {
  return (await fetchModelInfos(provider)).map(model => model.id)
}

async function fetchModelInfos(
  provider: ProviderKey,
): Promise<Array<{ id: string; supportsToolCalling: boolean | undefined }>> {
  const models = await fetchProviderModels(provider)
  return models.map(model => ({
    id: model.id,
    supportsToolCalling: model.capabilities.toolCalling !== 'none',
  }))
}

async function providerList(): Promise<string> {
  const config = await loadConfig()
  const currentProvider = ProviderManager.getInstance().getActiveProviderName()
  
  const entries = PROVIDER_KEYS.map(provider => {
    const info = getProviderInfo(provider)
    const hasKey = Boolean(config?.apiKeys?.[provider] || process.env[info.envKey])
    const isActive = provider === currentProvider

    return [
      `${isActive ? chalk.bold.green('●') : ' '} ${provider} (${info.label})${isActive ? chalk.dim(' (active)') : ''}`,
      `    key: ${hasKey ? chalk.green('saved') : info.isLocal ? chalk.dim('not required') : chalk.yellow(`missing ${info.envKey}`)}`,
    ].join('\n')
  })

  return [
    'Available Providers:',
    '',
    ...entries,
    '',
    'Use /providers set <provider> to switch.',
    'Use /providers models <provider> to see available models.',
  ].join('\n')
}

type ProviderCommandRunResult = {
  result: LocalCommandResult
  appliedConfig?: ProviderConfig
}

function getDefaultModelForProvider(provider: ProviderKey): string {
  return getProviderInfo(provider).defaultModel ?? ''
}

function applyProviderSelectionToSession(
  setAppState: ReturnType<typeof useSetAppState>,
  config: Pick<ProviderConfig, 'model' | 'provider' | 'apiKeys'>,
  isGlobal = false,
): void {
  const providerManager = ProviderManager.getInstance()
  
  if (config.provider) {
    providerManager.setSessionProvider(config.provider as any)
  }
  if (config.model) {
    providerManager.setSessionModel(config.model)
  }
  if (config.apiKeys) {
    providerManager.setSessionApiKeys(config.apiKeys)
  }

  setAppState(prev => ({
    ...prev,
    mainLoopModel: isGlobal ? config.model : prev.mainLoopModel,
    mainLoopModelForSession: isGlobal ? null : config.model,
    mainLoopProvider: isGlobal ? config.provider : prev.mainLoopProvider,
    mainLoopProviderForSession: isGlobal ? null : config.provider,
  }))
}

async function runProviderCommand(args: string): Promise<ProviderCommandRunResult> {
  const parts = args.trim() ? args.trim().split(/\s+/) : []
  const [subcommand = 'get', providerArg, ...modelParts] = parts
  const command = subcommand.toLowerCase()

  if (command === 'help' || command === '--help' || command === '-h') {
    return { result: { type: 'text', value: help() } }
  }

  if (command === 'list' || command === '--list' || command === '-l') {
    return { result: { type: 'text', value: await providerList() } }
  }

  if (command === 'get' || command === '--get' || command === '-g') {
    const config = await loadConfig()
    if (!config) {
      return {
        result: {
          type: 'text',
          value: `No provider configuration found.\n\n${help()}`,
        },
      }
    }
    const currentPath = getEffectiveProviderConfigPath()
    return {
      result: {
        type: 'text',
        value: `Current provider: ${config.provider}\nCurrent model: ${config.model}\nSaved API keys: ${Object.keys(config.apiKeys ?? {}).join(', ') || 'none'}\nConfig: ${currentPath}`,
      },
    }
  }

  if (command === 'key') {
    const provider = providerArg?.toLowerCase()
    if (!provider || !isProviderKey(provider)) {
      return {
        result: {
          type: 'text',
          value: `Unknown provider: ${provider ?? '(missing)'}\n\n${help()}`,
        },
      }
    }
    const setIndex = modelParts.findIndex(part => part.toLowerCase() === 'set')
    const apiKeyParts = setIndex === -1 ? modelParts : modelParts.slice(0, setIndex)
    const apiKey = apiKeyParts.join(' ')
    if (!apiKey) {
      return {
        result: {
          type: 'text',
          value: `Missing API key.\n\nUsage: /providers key ${provider} <api-key>`,
        },
      }
    }
    const setParts = setIndex === -1 ? [] : modelParts.slice(setIndex + 1)
    const setProvider = setParts[0]?.toLowerCase()
    const setModel = setParts.slice(1).join(' ')
    if (setParts.length > 0 && (!setProvider || !isProviderKey(setProvider))) {
      return {
        result: {
          type: 'text',
          value: `Unknown provider in set: ${setProvider ?? '(missing)'}`,
        },
      }
    }

    const isGlobal = modelParts.includes('--global') || modelParts.includes('-g')
    const currentConfig = await loadConfig()
    const nextProvider = (setProvider ?? currentConfig?.provider ?? provider) as ProviderKey
    const nextModel =
      setModel ||
      (nextProvider === currentConfig?.provider
        ? currentConfig?.model
        : getDefaultModelForProvider(nextProvider)) ||
      getDefaultModelForProvider(nextProvider)
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
    }
    
    if (isGlobal) {
      await saveConfig(nextConfig)
    }
    
    clearProviderModelsCache(nextProvider)

    const currentPath = getEffectiveProviderConfigPath()
    return {
      result: {
        type: 'text',
        value: setProvider
          ? `Saved API key for ${provider}\nSet provider to ${nextProvider}\nSet model to ${nextModel}${isGlobal ? `\nConfig saved: ${currentPath}` : '\n(Session only)'}`
          : `Saved API key for ${provider} ${isGlobal ? `to ${currentPath}` : '(Session only)'}`,
      },
      appliedConfig: setProvider ? nextConfig : undefined,
    }
  }

  if (command === 'reset' || command === '--reset' || command === '-r') {
    const isGlobal = modelParts.includes('--global') || modelParts.includes('-g')
    const currentConfig = await loadConfig()
    const defaultProviderInfo = getSerializableProviderInfo('openai')
    const config: ProviderConfig = {
      provider: 'openai',
      model: defaultProviderInfo.defaultModel ?? '',
      providerConfig: defaultProviderInfo,
      apiKeys: currentConfig?.apiKeys,
    }
    
    if (isGlobal) {
      await saveConfig(config)
    }
    
    clearProviderModelsCache(config.provider)
    const currentPath = getEffectiveProviderConfigPath()
    return {
      result: {
        type: 'text',
        value: `Reset provider to ${config.provider} (${config.model})${isGlobal ? `\nConfig saved: ${currentPath}` : '\n(Session only)'}`,
      },
      appliedConfig: config,
    }
  }

  if (command === 'set' || command === '--set' || command === '-s') {
    const provider = providerArg?.toLowerCase()
    if (!provider || !isProviderKey(provider)) {
      return {
        result: {
          type: 'text',
          value: `Unknown provider: ${provider ?? '(missing)'}\n\n${help()}`,
        },
      }
    }

    const isGlobal = modelParts.includes('--global') || modelParts.includes('-g')
    const actualModelParts = modelParts.filter(p => p !== '--global' && p !== '-g')

    let model = actualModelParts.join(' ')
    if (!model) {
      try {
        model = (await fetchModels(provider))[0] ?? ''
      } catch {
        model = ''
      }
    }
    if (!model) {
      return {
        result: {
          type: 'text',
          value: `No model was provided and ${getProviderInfo(provider).label} did not return models from its API.`,
        },
      }
    }
    const currentConfig = await loadConfig()
    const config: ProviderConfig = {
      provider,
      model,
      providerConfig: getSerializableProviderInfo(provider),
      apiKeys: currentConfig?.apiKeys,
    }
    
    if (isGlobal) {
      await saveConfig(config)
    }
    
    clearProviderModelsCache(provider)

    const currentPath = getEffectiveProviderConfigPath()
    return {
      result: {
        type: 'text',
        value: `Set provider to ${provider}\nSet model to ${model}${isGlobal ? `\nConfig saved: ${currentPath}` : '\n(Session only)'}`,
      },
      appliedConfig: config,
    }
  }

  if (command === 'models' || command === '--models' || command === '-m') {
    const provider = providerArg?.toLowerCase()
    if (!provider || !isProviderKey(provider)) {
      return {
        result: {
          type: 'text',
          value: `Unknown provider: ${provider ?? '(missing)'}\n\n${help()}`,
        },
      }
    }

    try {
      const models = await fetchModelInfos(provider)
      const visible = models
        .slice(0, 30)
        .map(model =>
          `${model.id}${model.supportsToolCalling === false ? ' (no tools)' : ''}`,
        )
        .join('\n')
      const suffix =
        models.length > 30 ? `\n... and ${models.length - 30} more` : ''
      return {
        result: {
          type: 'text',
          value: `Models from ${getProviderInfo(provider).label}:\n${visible || '(none returned)'}${suffix}`,
        },
      }
    } catch (error) {
      return {
        result: {
          type: 'text',
          value: `Failed to fetch models: ${(error as Error).message}`,
        },
      }
    }
  }

  return {
    result: {
      type: 'text',
      value: `Unknown provider command: ${subcommand}\n\n${help()}`,
    },
  }
}

function ProviderPicker({
  onDone,
}: {
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const [provider, setProvider] = React.useState<ProviderKey | null>(null)
  const [apiKeyInput, setApiKeyInput] = React.useState('')
  const [apiKeyCursorOffset, setApiKeyCursorOffset] = React.useState(0)
  const [apiKeyError, setApiKeyError] = React.useState<string | null>(null)
  const [config, setConfig] = React.useState<ProviderConfig | null>(null)
  const [showChangeKey, setShowChangeKey] = React.useState(false)
  const [isGhLogin, setIsGhLogin] = React.useState(false)
  const [anthropicType, setAnthropicType] = React.useState<'direct' | 'bedrock' | 'vertex' | 'foundry' | 'subscriber' | null>(null)
  const [googleType, setGoogleType] = React.useState<'direct' | 'vertex' | null>(null)
  const [openaiType, setOpenaiType] = React.useState<'direct' | 'subscriber' | 'azure' | null>(null)
  const setAppState = useSetAppState()
  const currentSessionModel = useAppState(s => (s.mainLoopModelForSession || s.mainLoopModel) as string | null)

  React.useEffect(() => {
    void loadConfig().then(loadedConfig => {
      setConfig(loadedConfig)
      if (loadedConfig?.provider === 'anthropic' && loadedConfig.providerConfig?.anthropicType) {
        setAnthropicType(loadedConfig.providerConfig.anthropicType)
      }
      if (loadedConfig?.provider === 'google' && (loadedConfig.providerConfig as any)?.googleType) {
        setGoogleType((loadedConfig.providerConfig as any).googleType)
      }
      if (loadedConfig?.provider === 'openai' && (loadedConfig.providerConfig as any)?.openaiType) {
        setOpenaiType((loadedConfig.providerConfig as any).openaiType)
      }
    })
  }, [])

  async function handleGhLogin() {
    setIsGhLogin(true)
    try {
      const { spawn } = await import('child_process')
      
      // Check if gh is installed
      try {
        await new Promise<void>((resolve, reject) => {
          const check = spawn('gh', ['--version'], { stdio: 'inherit' })
          check.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error('gh command failed'))
          })
        })
      } catch {
        setApiKeyError('GitHub CLI not installed. Install from https://cli.github.com/')
        setIsGhLogin(false)
        return
      }

      // Just get token directly (user should have already run gh auth login)
      const token = await new Promise<string>((resolve, reject) => {
        const tokenCmd = spawn('gh', ['auth', 'token'], { stdio: ['ignore', 'pipe', 'inherit'] })
        let stdout = ''
        tokenCmd.stdout.on('data', (data) => {
          stdout += data.toString()
        })
        tokenCmd.on('close', (code) => {
          if (code === 0) resolve(stdout.trim())
          else reject(new Error('gh auth token failed - please run "gh auth login" first'))
        })
      })

      if (!token) {
        setApiKeyError('Failed to get GitHub token. Please run "gh auth login" in your terminal first.')
        setIsGhLogin(false)
        return
      }

      await saveProviderSelection(token)
    } catch (error) {
      setApiKeyError(`GitHub CLI login failed: ${(error as Error).message}`)
      setIsGhLogin(false)
    }
  }

  async function saveProviderSelection(apiKey?: string) {
    if (!provider) return

    const trimmedApiKey = apiKey?.trim()
    const nextApiKeys = {
      ...(config?.apiKeys ?? {}),
      ...(trimmedApiKey ? { [provider]: trimmedApiKey } : {}),
    }

    const info = getProviderInfo(provider)
    const nextConfig: ProviderConfig = {
      provider,
      model: (currentSessionModel as string) || config?.model || info.defaultModel || '', // Keep session model or fall back
      providerConfig: {
        ...getSerializableProviderInfo(provider),
        ...(provider === 'anthropic' && anthropicType ? { anthropicType } : {}),
        ...(provider === 'google' && googleType ? { googleType } : {}),
        ...(provider === 'openai' && openaiType ? { openaiType } : {}),
        // Store the value from prompt if needed
        ...(provider === 'openai' && openaiType === 'azure' && apiKey ? { baseUrl: apiKey } : {}),
        ...(provider === 'google' && googleType === 'vertex' && apiKey ? { projectId: apiKey } : {}),
      } as any,
      apiKeys: nextApiKeys,
    }

    await saveConfig(nextConfig)
    clearProviderModelsCache(provider)

    // Invalidate provider config cache to force reload
    const providerManager = ProviderManager.getInstance()
    providerManager.invalidateConfigCache()

    const currentModel = nextConfig.model || info.defaultModel
    applyProviderSelectionToSession(setAppState, { model: currentModel, provider }, false)

    onDone(
      `Set provider to ${provider}\nModel: ${currentModel}\n(Session only)`,
      { display: 'system' },
    )
  }

  if (!provider) {
    const options = PROVIDER_KEYS.map(key => {
      const info = getProviderInfo(key)
      return {
        label: `${info.label} (${key})`,
        value: key,
        description: config?.apiKeys?.[key] || process.env[info.envKey]
          ? chalk.green(`${info.envKey} - ACTIVE ✔`)
          : info.isLocal
            ? 'local provider'
            : `${info.envKey} - MISSING  𐄂`,
      }
    })

    return React.createElement(Select, {
      options,
      visibleOptionCount: 10,
      onChange: value => {
        setProvider(value as ProviderKey)
        setApiKeyInput('')
        setApiKeyCursorOffset(0)
        setApiKeyError(null)
      },
      onCancel: () => {
        setShowChangeKey(false)
        onDone('Provider selection cancelled', { display: 'system' })
      },
    })
  }

  const info = getProviderInfo(provider)

  // Sub-menu for Anthropic implementation type
  if (provider === 'anthropic' && !anthropicType && !showChangeKey) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { marginBottom: 1 },
        `Select implementation for ${info.label}:`,
      ),
      React.createElement(Select, {
        options: [
          { label: 'Direct API', value: 'direct', description: 'Use ANTHROPIC_API_KEY' },
          { label: 'Claude.ai (Subscription)', value: 'subscriber', description: 'Use your Claude.ai account (requires /login)' },
          { label: 'AWS Bedrock', value: 'bedrock', description: 'Use AWS credentials' },
          { label: 'Google Vertex AI', value: 'vertex', description: 'Use GCP credentials' },
          { label: 'Microsoft Foundry', value: 'foundry', description: 'Use Azure credentials' },
        ],
        visibleOptionCount: 5,
        onChange: value => {
          setAnthropicType(value as any)
          if (value !== 'direct') {
            // Bedrock/Vertex/Foundry usually don't need a single API key in the same way
            // or they use different env vars.
          }
        },
        onCancel: () => {
          setProvider(null)
        },
      }),
    )
  }

  // Sub-menu for Google implementation type
  if (provider === 'google' && !googleType && !showChangeKey) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { marginBottom: 1 },
        `Select implementation for ${info.label}:`,
      ),
      React.createElement(Select, {
        options: [
          { label: 'Google AI Studio', value: 'direct', description: 'Use GOOGLE_API_KEY (Free/AI Premium)' },
          { label: 'Google Vertex AI', value: 'vertex', description: 'Use GCP credentials' },
        ],
        visibleOptionCount: 2,
        onChange: value => setGoogleType(value as any),
        onCancel: () => setProvider(null),
      }),
    )
  }

  // Sub-menu for OpenAI implementation type
  if (provider === 'openai' && !openaiType && !showChangeKey) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { marginBottom: 1 },
        `Select implementation for ${info.label}:`,
      ),
      React.createElement(Select, {
        options: [
          { label: 'Direct API', value: 'direct', description: 'Use OPENAI_API_KEY' },
          { label: 'ChatGPT Plus (Web)', value: 'subscriber', description: 'Use ChatGPT session token' },
          { label: 'Azure OpenAI', value: 'azure', description: 'Use Azure OpenAI credentials' },
        ],
        visibleOptionCount: 3,
        onChange: value => setOpenaiType(value as any),
        onCancel: () => setProvider(null),
      }),
    )
  }

  const hasExistingKey = Boolean(config?.apiKeys?.[provider] || process.env[info.envKey])

  // Show GitHub CLI login option for copilot
  if (provider === 'copilot' && !hasExistingKey && !info.isLocal && !showChangeKey && !isGhLogin) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { marginBottom: 1 },
        `API key required for ${info.label} (${info.envKey})`,
      ),
      React.createElement(Select, {
        options: [
          {
            label: 'Login with GitHub CLI',
            value: 'gh_login',
            description: 'Use gh auth login to authenticate',
          },
          {
            label: 'Enter token manually',
            value: 'manual',
            description: `Paste ${info.envKey} directly`,
          },
        ],
        visibleOptionCount: 2,
        onChange: value => {
          if (value === 'gh_login') {
            void handleGhLogin()
          } else {
            setShowChangeKey(true)
          }
        },
        onCancel: () => {
          setProvider(null)
          setShowChangeKey(false)
        },
      }),
    )
  }

  // Show loading state for gh login
  if (isGhLogin) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(Text, { color: 'yellow' }, 'Getting GitHub token from CLI...'),
      React.createElement(Text, { dimColor: true }, 'If not logged in, run this in a separate terminal:'),
      React.createElement(Text, { color: 'cyan' }, '  gh auth login'),
      React.createElement(Text, { dimColor: true }, 'Then press Enter here to get the token'),
    )
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
          : anthropicType && anthropicType !== 'direct' && anthropicType !== 'subscriber'
            ? `API key/Token (Optional) for ${info.label} ${anthropicType} (Press Enter to skip)`
            : anthropicType === 'subscriber'
              ? `Note: Subscription mode uses OAuth. Please run /login if you haven't already. (Press Enter to continue)`
              : openaiType === 'subscriber'
                ? `Enter CHATGPT_SESSION_TOKEN for ChatGPT Plus (Web)`
                : googleType === 'vertex'
                  ? `Enter Google Cloud Project ID for Vertex AI (or press Enter to use GCLOUD_PROJECT env)`
                  : openaiType === 'azure'
                    ? `Enter Azure OpenAI Endpoint URL (e.g. https://res-name.openai.azure.com/)`
                    : `API key required for ${info.label} (${info.envKey})`,
      ),
      apiKeyError
        ? React.createElement(Text, { color: 'error', marginBottom: 1 }, apiKeyError)
        : null,
      React.createElement(TextInput, {
        value: apiKeyInput,
        onChange: value => {
          setApiKeyInput(value)
          setApiKeyError(null)
        },
        onSubmit: async value => {
          const trimmed = value.trim()
          const needsKey = 
            (!anthropicType || anthropicType === 'direct') &&
            (!googleType || googleType === 'direct') &&
            (!openaiType || openaiType === 'direct')

          if (!trimmed && needsKey) {
            setApiKeyError(`Enter ${info.envKey} or cancel to go back.`)
            return
          }
          await saveProviderSelection(trimmed)
        },
        onExit: () => {
          setProvider(null)
          setApiKeyInput('')
          setApiKeyCursorOffset(0)
          setApiKeyError(null)
          setShowChangeKey(false)
          setIsGhLogin(false)
          setAnthropicType(null)
          setGoogleType(null)
          setOpenaiType(null)
        },
        placeholder: `Paste ${info.envKey}`,
        mask: '*',
        focus: true,
        showCursor: true,
        columns: 80,
        cursorOffset: apiKeyCursorOffset,
        onChangeCursorOffset: setApiKeyCursorOffset,
      }),
    )
  }

  // Provider has existing key - show options to use existing or change
  if (hasExistingKey && !info.isLocal && !showChangeKey) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { marginBottom: 1 },
        `${info.label} has an API key configured (${info.envKey})`,
      ),
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
            setShowChangeKey(true)
          } else {
            void saveProviderSelection()
          }
        },
        onCancel: () => {
          setProvider(null)
          setShowChangeKey(false)
        },
      }),
    )
  }

  void saveProviderSelection()
  return null
}

function ProviderCommandRunner({
  args,
  onDone,
}: {
  args: string
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const setAppState = useSetAppState()

  React.useEffect(() => {
    void runProviderCommand(args)
      .then(({ result, appliedConfig }) => {
        if (appliedConfig) {
          const parts = args.trim().split(/\s+/)
          const isGlobal = parts.includes('--global') || parts.includes('-g')
          applyProviderSelectionToSession(setAppState, appliedConfig, isGlobal)
        }
        if (result.type === 'text') {
          onDone(result.value)
        } else {
          onDone(undefined, { display: 'skip' })
        }
      })
      .catch(err => {
        onDone(`Provider command failed: ${(err as Error).message}`, {
          display: 'system',
        })
      })
  }, [args, onDone, setAppState])

  return null
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  if (args.trim()) {
    return React.createElement(ProviderCommandRunner, { args, onDone })
  }

  return React.createElement(ProviderPicker, { onDone })
}
