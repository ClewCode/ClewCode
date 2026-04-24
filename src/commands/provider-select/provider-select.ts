import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import * as React from 'react'
import { Select } from '../../components/CustomSelect/select.js'
import type {
  LocalCommandResult,
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../../types/command.js'

type ProviderConfig = {
  provider: string
  model: string
  apiKeys?: Partial<Record<ProviderKey, string>>
  providerConfig?: ProviderInfo
}

type ProviderInfo = {
  label: string
  envKey: string
  baseUrl: string
  modelsUrl: string
  defaultModel?: string
  defaultModelVerified?: boolean
  note: string
  isLocal?: boolean
  timeout?: number
  supportsStreaming?: boolean
}

const CONFIG_PATH = join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.claude-code-provider.json',
)

const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    modelsUrl: 'https://api.openai.com/v1/models',
    defaultModel: 'gpt-5.4-mini',
    defaultModelVerified: true,
    note: 'gpt-5.4 = flagship, gpt-5.4-mini = cost-efficient',
  },
  anthropic: {
    label: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultModelVerified: true,
    note: 'claude-sonnet-4-20250514 = balanced',
  },
  gemini: {
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.5-flash',
    defaultModelVerified: true,
    note: 'gemini-2.5-flash = best price-performance',
  },
  openrouter: {
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    defaultModel: 'openai/gpt-5.4-mini',
    note: 'Use model strings like provider/model-name',
  },
  opencode: {
    label: 'OpenCode',
    envKey: 'OPENCODE_API_KEY',
    baseUrl: 'https://opencode.ai/zen/v1',
    modelsUrl: 'https://opencode.ai/zen/v1/models',
    defaultModel: 'qwen3.6-plus',
    note: 'For OpenAI-compatible /chat/completions use qwen3.6-plus, minimax-m2.7, glm-5.1, kimi-k2.6, big-pickle.',
  },
  cline: {
    label: 'Cline API',
    envKey: 'CLINE_API_KEY',
    baseUrl: 'https://api.cline.bot/api/v1',
    modelsUrl: 'https://api.cline.bot/api/v1/models',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    note: 'Cline is OpenAI-compatible chat/completions; use free model examples like minimax/minimax-m2.5',
  },
  groq: {
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    defaultModel: 'llama-3.3-70b-versatile',
    note: 'llama-3.1-8b-instant = fast, llama-3.3-70b-versatile = smarter',
  },
  xai: {
    label: 'xAI',
    envKey: 'XAI_API_KEY',
    baseUrl: 'https://api.x.ai/v1',
    modelsUrl: 'https://api.x.ai/v1/models',
    defaultModel: 'grok-4-mini',
    note: 'chat/completions is legacy; newer xAI features may arrive via Responses first',
  },
  mistral: {
    label: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    defaultModel: 'mistral-large-latest',
    defaultModelVerified: true,
    note: 'mistral-large-latest = flagship',
  },
  kilocode: {
    label: 'KiloCode',
    envKey: 'KILOCODE_API_KEY',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    modelsUrl: 'https://api.kilo.ai/api/gateway/models',
    defaultModel: 'kilo-auto/free',
    defaultModelVerified: true,
    supportsStreaming: true,
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
    note: 'Local Ollama server',
  },
} satisfies Record<string, ProviderInfo>

type ProviderKey = keyof typeof PROVIDERS

function isProviderKey(provider: string): provider is ProviderKey {
  return provider in PROVIDERS
}

async function loadConfig(): Promise<ProviderConfig | null> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8')) as ProviderConfig
  } catch {
    return null
  }
}

async function saveConfig(config: ProviderConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
}

function help(): string {
  return [
    'Usage:',
    '  /provider',
    '  /provider list',
    '  /provider key <provider> <api-key>',
    '  /provider set <provider> [model]',
    '  /provider reset',
    '  /provider models <provider>',
    '',
    `Available providers: ${Object.keys(PROVIDERS).join(', ')}`,
  ].join('\n')
}

async function fetchModels(provider: ProviderKey): Promise<string[]> {
  const info = PROVIDERS[provider]
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const config = await loadConfig()
  const apiKey = config?.apiKeys?.[provider] || process.env[info.envKey]

  if (!apiKey && !info.isLocal) {
    if (info.defaultModelVerified && info.defaultModel) {
      return [info.defaultModel]
    }
    throw new Error(`missing ${info.envKey}`)
  }

  if (apiKey) {
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey
    } else {
      headers.Authorization = `Bearer ${apiKey}`
    }
  }

  const response = await fetch(info.modelsUrl, {
    headers,
    signal: AbortSignal.timeout(30000),
  })
  const data = (await response.json()) as {
    data?: Array<{ id?: string; name?: string }>
    models?: Array<{ id?: string; name?: string }>
  }
  const models = data.data ?? data.models ?? []
  const parsed = models
    .map(model => model.id ?? model.name)
    .filter((model): model is string => Boolean(model))

  if (parsed.length > 0) {
    return parsed
  }

  if (info.defaultModelVerified && info.defaultModel) {
    return [info.defaultModel]
  }

  return []
}

async function providerList(): Promise<string> {
  const config = await loadConfig()
  const entries = await Promise.all(
    (Object.keys(PROVIDERS) as ProviderKey[]).map(async provider => {
      const info = PROVIDERS[provider]
      const hasKey = Boolean(config?.apiKeys?.[provider] || process.env[info.envKey])

      try {
        const models = await fetchModels(provider)
        const visible = models.slice(0, 12).join('\n    ')
        const suffix =
          models.length > 12 ? `\n    ... and ${models.length - 12} more` : ''

        return [
          `${provider} (${info.label})`,
          `  key: ${hasKey ? 'saved' : info.isLocal ? 'not required' : `missing ${info.envKey}`}`,
          `  models from API (${models.length}):`,
          `    ${visible || '(none returned)'}`,
          suffix,
        ]
          .filter(Boolean)
          .join('\n')
      } catch (error) {
        return [
          `${provider} (${info.label})`,
          `  key: ${hasKey ? 'saved' : info.isLocal ? 'not required' : `missing ${info.envKey}`}`,
          `  models: unavailable (${(error as Error).message})`,
        ].join('\n')
      }
    }),
  )

  return entries.join('\n\n')
}

async function runProviderCommand(args: string): Promise<LocalCommandResult> {
  const parts = args.trim() ? args.trim().split(/\s+/) : []
  const [subcommand = 'get', providerArg, ...modelParts] = parts
  const command = subcommand.toLowerCase()

  if (command === 'help' || command === '--help' || command === '-h') {
    return { type: 'text', value: help() }
  }

  if (command === 'list' || command === '--list' || command === '-l') {
    return { type: 'text', value: await providerList() }
  }

  if (command === 'get' || command === '--get' || command === '-g') {
    const config = await loadConfig()
    if (!config) {
      return {
        type: 'text',
        value: `No provider configuration found.\n\n${help()}`,
      }
    }
    return {
      type: 'text',
      value: `Current provider: ${config.provider}\nCurrent model: ${config.model}\nSaved API keys: ${Object.keys(config.apiKeys ?? {}).join(', ') || 'none'}\nConfig: ${CONFIG_PATH}`,
    }
  }

  if (command === 'key') {
    const provider = providerArg?.toLowerCase()
    if (!provider || !isProviderKey(provider)) {
      return {
        type: 'text',
        value: `Unknown provider: ${provider ?? '(missing)'}\n\n${help()}`,
      }
    }
    const setIndex = modelParts.findIndex(part => part.toLowerCase() === 'set')
    const apiKeyParts = setIndex === -1 ? modelParts : modelParts.slice(0, setIndex)
    const apiKey = apiKeyParts.join(' ')
    if (!apiKey) {
      return {
        type: 'text',
        value: `Missing API key.\n\nUsage: /provider key ${provider} <api-key>`,
      }
    }
    const setParts = setIndex === -1 ? [] : modelParts.slice(setIndex + 1)
    const setProvider = setParts[0]?.toLowerCase()
    const setModel = setParts.slice(1).join(' ')
    if (setParts.length > 0 && (!setProvider || !isProviderKey(setProvider))) {
      return {
        type: 'text',
        value: `Unknown provider in set: ${setProvider ?? '(missing)'}`,
      }
    }

    const currentConfig = await loadConfig()
    const nextProvider = setProvider ?? currentConfig?.provider ?? provider
    await saveConfig({
      provider: nextProvider,
      model: setModel || currentConfig?.model || '',
      providerConfig:
        currentConfig?.providerConfig ??
        PROVIDERS[nextProvider] ??
        PROVIDERS[provider],
      apiKeys: {
        ...(currentConfig?.apiKeys ?? {}),
        [provider]: apiKey,
      },
    })

    return {
      type: 'text',
      value: setProvider
        ? `Saved API key for ${provider}\nSet provider to ${nextProvider}\nSet model to ${setModel}\nConfig: ${CONFIG_PATH}`
        : `Saved API key for ${provider} to ${CONFIG_PATH}`,
    }
  }

  if (command === 'reset' || command === '--reset' || command === '-r') {
    const currentConfig = await loadConfig()
    const config = {
      provider: 'openai',
      model: PROVIDERS.openai.defaultModel,
      providerConfig: PROVIDERS.openai,
      apiKeys: currentConfig?.apiKeys,
    }
    await saveConfig(config)
    return {
      type: 'text',
      value: `Reset provider to ${config.provider} (${config.model})\nConfig: ${CONFIG_PATH}`,
    }
  }

  if (command === 'set' || command === '--set' || command === '-s') {
    const provider = providerArg?.toLowerCase()
    if (!provider || !isProviderKey(provider)) {
      return {
        type: 'text',
        value: `Unknown provider: ${provider ?? '(missing)'}\n\n${help()}`,
      }
    }

    let model = modelParts.join(' ')
    if (!model) {
      try {
        model = (await fetchModels(provider))[0] ?? ''
      } catch {
        model = ''
      }
    }
    if (!model) {
      return {
        type: 'text',
        value: `No model was provided and ${PROVIDERS[provider].label} did not return models from its API.`,
      }
    }
    const currentConfig = await loadConfig()
    const config = {
      provider,
      model,
      providerConfig: PROVIDERS[provider],
      apiKeys: currentConfig?.apiKeys,
    }
    await saveConfig(config)

    return {
      type: 'text',
      value: `Set provider to ${provider}\nSet model to ${model}\nConfig: ${CONFIG_PATH}`,
    }
  }

  if (command === 'models' || command === '--models' || command === '-m') {
    const provider = providerArg?.toLowerCase()
    if (!provider || !isProviderKey(provider)) {
      return {
        type: 'text',
        value: `Unknown provider: ${provider ?? '(missing)'}\n\n${help()}`,
      }
    }

    try {
      const models = await fetchModels(provider)
      const visible = models.slice(0, 30).join('\n')
      const suffix =
        models.length > 30 ? `\n... and ${models.length - 30} more` : ''
      return {
        type: 'text',
        value: `Models from ${PROVIDERS[provider].label}:\n${visible || '(none returned)'}${suffix}`,
      }
    } catch (error) {
      return {
        type: 'text',
        value: `Failed to fetch models: ${(error as Error).message}`,
      }
    }
  }

  return {
    type: 'text',
    value: `Unknown provider command: ${subcommand}\n\n${help()}`,
  }
}

function ProviderPicker({
  onDone,
}: {
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const [provider, setProvider] = React.useState<ProviderKey | null>(null)
  const [models, setModels] = React.useState<string[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [config, setConfig] = React.useState<ProviderConfig | null>(null)

  React.useEffect(() => {
    void loadConfig().then(setConfig)
  }, [])

  React.useEffect(() => {
    if (!provider) return

    let cancelled = false
    setModels(null)
    setError(null)

    void fetchModels(provider)
      .then(nextModels => {
        if (!cancelled) setModels(nextModels)
      })
      .catch(err => {
        if (!cancelled) setError((err as Error).message)
      })

    return () => {
      cancelled = true
    }
  }, [provider])

  if (!provider) {
    const options = (Object.keys(PROVIDERS) as ProviderKey[]).map(key => {
      const info = PROVIDERS[key]
      return {
        label: `${info.label} (${key})`,
        value: key,
        description: config?.apiKeys?.[key] || process.env[info.envKey]
          ? `${info.envKey} found`
          : info.isLocal
            ? 'local provider'
            : `missing ${info.envKey}`,
      }
    })

    return React.createElement(Select, {
      options,
      visibleOptionCount: 10,
      onChange: value => setProvider(value as ProviderKey),
      onCancel: () => onDone('Provider selection cancelled', { display: 'system' }),
    })
  }

  if (error) {
    return React.createElement(Select, {
      options: [
        {
          label: `Back to providers (${error})`,
          value: 'back',
        },
      ],
      onChange: () => setProvider(null),
      onCancel: () => onDone('Provider selection cancelled', { display: 'system' }),
    })
  }

  if (!models) {
    return React.createElement(Select, {
      options: [
        {
          label: `Loading models from ${PROVIDERS[provider].label}...`,
          value: 'loading',
        },
      ],
      disableSelection: true,
    })
  }

  const options = models.map(model => ({
    label: model,
    value: model,
  }))

  return React.createElement(Select, {
    options,
    visibleOptionCount: 12,
    onChange: async value => {
      const model = String(value)
      await saveConfig({
        provider,
        model,
        providerConfig: PROVIDERS[provider],
        apiKeys: config?.apiKeys,
      })
      onDone(`Set provider to ${provider}\nSet model to ${model}`)
    },
    onCancel: () => setProvider(null),
  })
}

function ProviderCommandRunner({
  args,
  onDone,
}: {
  args: string
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  React.useEffect(() => {
    void runProviderCommand(args)
      .then(result => {
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
  }, [args, onDone])

  return null
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  if (args.trim()) {
    return React.createElement(ProviderCommandRunner, { args, onDone })
  }

  return React.createElement(ProviderPicker, { onDone })
}
