import { AnthropicProvider } from './providers/AnthropicProvider.js'
import { GoogleProvider } from './providers/GoogleProvider.js'
import { OpenAICompatibleProvider } from './providers/OpenAICompatibleProvider.js'
import { OpenAIResponsesProvider } from './providers/OpenAIResponsesProvider.js'
import { OpenAIProvider } from './providers/OpenAIProvider.js'
import { OllamaProvider } from './providers/OllamaProvider.js'
import { OpenRouterProvider } from './providers/OpenRouterProvider.js'
import { ChatGPTSessionProvider } from './providers/ChatGPTSessionProvider.js'
import { KiloCodeProvider } from './providers/KiloCodeProvider.js'
import { CopilotProvider } from './providers/CopilotProvider.js'
import type { ProviderId, ProviderInterface } from './providers/ProviderInterface.js'

export type ToolCallingSupport = 'native' | 'json-text' | 'none'
export type ProviderStreamingSupport = 'full' | 'partial' | 'none'

export interface ModelCapabilities {
  toolCalling: ToolCallingSupport
  vision: boolean
  streaming: ProviderStreamingSupport
  maxContext: number | 'varies'
  maxOutput?: number | 'varies'
  reasoning: boolean
  supportsSystemPrompt: boolean
  free?: boolean
  rateLimited?: boolean
}

export interface ProviderCapabilities {
  chat: boolean
  streaming: ProviderStreamingSupport
  toolCalling: boolean
  vision: boolean
  jsonSchema: boolean
  reasoningEffort: boolean
  contextLength: string
}

export interface ProviderModelInfo {
  id: string
  label?: string
  capabilities: ModelCapabilities
  tags?: string[]
  supportedTypes?: string[]
}

export interface ProviderRegistryEntry {
  providerId: ProviderId
  label: string
  envKey: string
  defaultBaseUrl: string
  modelsUrl?: string
  defaultModel?: string
  defaultModelVerified?: boolean
  note?: string
  isLocal?: boolean
  capabilities: ProviderCapabilities
  models: ProviderModelInfo[]
  provider: ProviderInterface
}

export const PROVIDER_REGISTRY = {
  anthropic: {
    providerId: 'anthropic',
    label: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    defaultModel: 'claude-sonnet-4-6',
    defaultModelVerified: true,
    note: 'Full Anthropic Claude support with native tool calling and reasoning. Updated 2026.',
    capabilities: {
      chat: true,
      streaming: 'full',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: '100k+',
    },
    models: [
      {
        id: 'claude-opus-4-7',
        label: 'Claude Opus 4.7 (2026-04-14)',
        tags: ['tools', 'vision', 'native', 'verified', 'latest'],
        supportedTypes: ['direct', 'subscriber', 'bedrock', 'vertex', 'foundry'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 1000000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6 (2026-02-17)',
        tags: ['tools', 'vision', 'native', 'verified', 'recommended'],
        supportedTypes: ['direct', 'subscriber', 'bedrock', 'vertex', 'foundry'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 1000000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'claude-opus-4-6',
        label: 'Claude Opus 4.6 (2026-02-04)',
        tags: ['tools', 'vision', 'native', 'verified'],
        supportedTypes: ['direct', 'subscriber', 'bedrock', 'vertex', 'foundry'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 1000000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'claude-opus-4-5-20251101',
        label: 'Claude Opus 4.5 (2025-11-01)',
        tags: ['tools', 'vision', 'native'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 200000,
          maxOutput: 64000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'claude-haiku-4-5-20251001',
        label: 'Claude Haiku 4.5 (2025-10-01)',
        tags: ['tools', 'vision', 'native', 'fast'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 200000,
          maxOutput: 64000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        label: 'Claude Sonnet 4.5 (2025-09-29)',
        tags: ['tools', 'vision', 'native'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 1000000,
          maxOutput: 64000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
    ],
    provider: new AnthropicProvider(),
  },
  openai: {
    providerId: 'openai',
    label: 'OpenAI (API Key)',
    envKey: 'OPENAI_API_KEY',
    defaultBaseUrl: 'https://api.openai.com/v1',
    modelsUrl: 'https://api.openai.com/v1/models',
    defaultModel: 'gpt-5.5',
    defaultModelVerified: true,
    note: 'OpenAI-compatible provider with function calling and streaming support. Updated 2026.',
    capabilities: {
      chat: true,
      streaming: 'full',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: '1M+',
    },
    models: [
      {
        id: 'gpt-5.5-pro',
        label: 'GPT-5.5 Pro (2026-04-23)',
        tags: ['tools', 'vision', 'native', 'verified', 'latest', 'reasoning'],
        supportedTypes: ['direct', 'azure'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 1050000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'gpt-5.5-thinking',
        label: 'GPT-5.5 Thinking',
        tags: ['reasoning', 'research'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'full',
          maxContext: 1050000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5 (2026-04)',
        tags: ['tools', 'vision', 'native', 'verified', 'latest'],
        supportedTypes: ['direct', 'azure', 'subscriber'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 1050000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'gpt-5.5-pro',
        label: 'GPT-5.5 Pro',
        tags: ['tools', 'vision', 'native', 'verified', 'reasoning'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 1050000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'gpt-5.4-mini',
        label: 'GPT-5.4 Mini',
        tags: ['tools', 'vision', 'native', 'fast'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 'varies',
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
    ],
    provider: new OpenAIProvider(),
  },
  google: {
    providerId: 'google',
    label: 'Google',
    envKey: 'GOOGLE_API_KEY',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/v1/models',
    // Native SDK does not use HTTP models endpoint; hardcoded models below
    defaultModel: 'gemini-3.1-flash',
    defaultModelVerified: true,
    note: 'Google Gemini via native SDK (GoogleProvider). Updated 2026-04-25.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: '1M+',
    },
    models: [
      {
        id: 'gemini-3.1-flash',
        label: 'Gemini 3.1 Flash (2026-04-14)',
        tags: ['tools', 'vision', 'native', 'fast'],
        supportedTypes: ['direct', 'vertex'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1000000,
          maxOutput: 8192,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'gemini-3.1-pro',
        label: 'Gemini 3.1 Pro (2026-02-15)',
        tags: ['tools', 'vision', 'native', 'recommended'],
        supportedTypes: ['direct', 'vertex'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 2000000,
          maxOutput: 8192,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
    ],
    provider: new GoogleProvider(),
  },
  // openai_browser and openai_headless removed - require session token from browser
  // Use OpenAI API (openai) instead for direct API access
  copilot: {
    providerId: 'copilot',
    label: 'GitHub Copilot',
    envKey: 'COPILOT_GITHUB_TOKEN',
    defaultBaseUrl: 'https://api.githubcopilot.com',
    defaultModel: 'gpt-4o',
    capabilities: {
      chat: true,
      streaming: 'full',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: false,
      contextLength: '32k',
    },
    models: [
      {
        id: 'gpt-5.5',
        label: 'Copilot GPT-5.5 (Latest)',
        capabilities: { toolCalling: 'native', vision: true, streaming: 'full', maxContext: 1050000, reasoning: true, supportsSystemPrompt: true },
      },
      {
        id: 'gpt-4o',
        label: 'Copilot GPT-4o',
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 32768,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      }
    ],
    provider: new CopilotProvider(),
  },
  openrouter: {
    providerId: 'openrouter',
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    defaultModelVerified: false,
    note: 'OpenRouter is OpenAI-compatible; verify the model before use.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
    models: [
      { id: 'openai/gpt-5.5-pro', label: 'GPT-5.5 Pro (via OpenRouter)', capabilities: { toolCalling: 'native', vision: true, streaming: 'partial', maxContext: 1050000, reasoning: true, supportsSystemPrompt: true } },
      { id: 'anthropic/claude-opus-4-7', label: 'Claude 4.7 Opus (via OpenRouter)', capabilities: { toolCalling: 'native', vision: true, streaming: 'partial', maxContext: 1000000, reasoning: true, supportsSystemPrompt: true } },
      { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro (via OpenRouter)', capabilities: { toolCalling: 'native', vision: true, streaming: 'partial', maxContext: 1000000, reasoning: true, supportsSystemPrompt: true } },
    ],
    provider: new OpenRouterProvider(),
  },
  deepseek: {
    providerId: 'openai', // Using OpenAI provider logic for deepseek as it is compatible
    label: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    modelsUrl: 'https://api.deepseek.com/v1/models',
    defaultModel: 'deepseek-v4-pro',
    defaultModelVerified: true,
    note: 'DeepSeek V4 family. Released April 24, 2026.',
    capabilities: {
      chat: true,
      streaming: 'full',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: '1M',
    },
    models: [
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro (2026-04-24)',
        tags: ['tools', 'vision', 'latest', 'moe'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 1000000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        tags: ['fast', 'efficient', 'moe'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 1000000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
    ],
    provider: new OpenAIProvider(),
  },
  opencode: {
    providerId: 'opencode',
    label: 'OpenCode',
    envKey: 'OPENCODE_API_KEY',
    defaultBaseUrl: 'https://opencode.ai/zen/v1',
    modelsUrl: 'https://opencode.ai/zen/v1/models',
    defaultModel: 'claude-opus-4-7',
    defaultModelVerified: true,
    note: 'OpenCode AI gateway (OpenAI-compatible). Updated 2026-04-25.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
    models: [
      {
        id: 'claude-opus-4-7',
        label: 'Claude Opus 4.7 (2026-04)',
        tags: ['tools', 'vision', 'latest'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1000000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        tags: ['tools', 'vision', 'recommended'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1000000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5 (2026-04)',
        tags: ['tools', 'vision', 'latest'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1050000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'gpt-5.5-pro',
        label: 'GPT-5.5 Pro',
        tags: ['tools', 'vision', 'pro'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1050000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'gemini-3.1-pro',
        label: 'Gemini 3.1 Pro (2026-02)',
        tags: ['tools', 'vision', 'reasoning'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1000000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'kimi-k2.6',
        label: 'Kimi K2.6 (2026-04)',
        tags: ['tools', 'vision', 'open-weight'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 256000,
          maxOutput: 65536,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'glm-5.1',
        label: 'GLM 5.1 (2026-04-07)',
        tags: ['tools', 'reasoning', 'latest'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 202752,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'glm-5.0',
        label: 'GLM 5.0',
        tags: ['tools', 'reasoning'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 202752,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'minimax-m2.7',
        label: 'MiniMax M2.7 (2026-03)',
        tags: ['tools', 'reasoning'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 196608,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
    ],
    provider: new OpenAICompatibleProvider(
      'opencode',
      'OpenCode',
      'OPENCODE_API_KEY',
      'https://opencode.ai/zen/v1',
    ),
  },
  cline: {
    providerId: 'cline',
    label: 'Cline API',
    envKey: 'CLINE_API_KEY',
    defaultBaseUrl: 'https://api.cline.bot/api/v1',
    // Cline API does not support /models endpoint (404)
    // Model IDs follow provider/model-name format (same as OpenRouter)
    defaultModel: 'anthropic/claude-opus-4-7',
    defaultModelVerified: true,
    note: 'Cline API (OpenAI-compatible). Model IDs: provider/model-name. Updated 2026-04-25.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
    models: [
      {
        id: 'anthropic/claude-opus-4-7',
        label: 'Claude Opus 4.7 (2026-04)',
        tags: ['tools', 'vision', 'latest'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1000000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'anthropic/claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        tags: ['tools', 'vision', 'recommended'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1000000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'openai/gpt-5.5',
        label: 'GPT-5.5 (2026-04)',
        tags: ['tools', 'vision', 'latest'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1050000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'google/gemini-3.1-pro',
        label: 'Gemini 3.1 Pro (2026-02)',
        tags: ['tools', 'vision', 'reasoning'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1000000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'minimax/minimax-m2.5',
        label: 'MiniMax M2.5 (Free)',
        tags: ['tools', 'reasoning', 'free'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 1000000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
    ],
    provider: new OpenAICompatibleProvider(
      'cline',
      'Cline API',
      'CLINE_API_KEY',
      'https://api.cline.bot/api/v1',
    ),
  },
  groq: {
    providerId: 'groq',
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    defaultModelVerified: false,
    note: 'Groq uses an OpenAI-compatible endpoint; verify models before use.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
    models: [
      { id: 'llama-4-70b', label: 'Llama 4 70B (Fast)', capabilities: { toolCalling: 'native', vision: false, streaming: 'partial', maxContext: 128000, reasoning: true, supportsSystemPrompt: true } },
      { id: 'llama-4-8b', label: 'Llama 4 8B (Instant)', capabilities: { toolCalling: 'native', vision: false, streaming: 'partial', maxContext: 128000, reasoning: true, supportsSystemPrompt: true } },
    ],
    provider: new OpenAICompatibleProvider(
      'groq',
      'Groq',
      'GROQ_API_KEY',
      'https://api.groq.com/openai/v1',
    ),
  },
  xai: {
    providerId: 'xai',
    label: 'xAI',
    envKey: 'XAI_API_KEY',
    defaultBaseUrl: 'https://api.x.ai/v1',
    modelsUrl: 'https://api.x.ai/v1/models',
    defaultModel: 'grok-4-20',
    defaultModelVerified: true,
    note: 'xAI Grok models. Updated 2026.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: '128k',
    },
    models: [
      {
        id: 'grok-4-20',
        label: 'Grok 4.20 Beta 2 (2026-03)',
        tags: ['tools', 'vision', 'reasoning', 'latest'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 128000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'grok-4-3',
        label: 'Grok 4.3 Beta (2026-04)',
        tags: ['tools', 'vision', 'reasoning', 'preview'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 128000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'grok-4',
        label: 'Grok 4 (Latest)',
        tags: ['tools', 'vision', 'reasoning', 'recommended'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 128000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
    ],
    provider: new OpenAICompatibleProvider(
      'xai',
      'xAI',
      'XAI_API_KEY',
      'https://api.x.ai/v1',
    ),
  },
  mistral: {
    providerId: 'mistral',
    label: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    defaultModel: 'mistral-small-latest',
    defaultModelVerified: true,
    note: 'Mistral via OpenAI-compatible endpoint. Updated 2026.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
    models: [
      {
        id: 'mistral-large-4',
        label: 'Mistral Large 4 (2026-04)',
        tags: ['tools', 'reasoning', 'latest'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'full',
          maxContext: 128000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'mistral-small-latest',
        label: 'Mistral Small 4 (2026-03)',
        tags: ['tools', 'vision', 'reasoning', 'latest', 'recommended'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 'varies',
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'mistral-large-latest',
        label: 'Mistral Large 3 (2025-12)',
        tags: ['tools', 'reasoning', 'verified'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 'varies',
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'ministral-3-14b',
        label: 'Ministral 3 14B',
        tags: ['tools', 'fast', 'efficient'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 'varies',
          maxOutput: 'varies',
          reasoning: false,
          supportsSystemPrompt: true,
        },
      },
    ],
    provider: new OpenAICompatibleProvider(
      'mistral',
      'Mistral',
      'MISTRAL_API_KEY',
      'https://api.mistral.ai/v1',
    ),
  },
  kilocode: {
    providerId: 'kilocode',
    label: 'KiloCode',
    envKey: 'KILOCODE_API_KEY',
    defaultBaseUrl: 'https://api.kilo.ai/api/gateway',
    modelsUrl: 'https://api.kilo.ai/api/gateway/models',
    defaultModel: 'kilo-auto/free',
    defaultModelVerified: true,
    note: 'KiloCode AI gateway (OpenRouter) with 500+ models. Updated 2026-04-25.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
    models: [
      {
        id: 'kilo-auto/free',
        label: 'KiloCode Free',
        tags: ['tools', 'free', 'verified'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 'varies',
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'openai/gpt-5.5',
        label: 'OpenAI GPT-5.5 (2026-04-23)',
        tags: ['tools', 'vision', 'reasoning', 'latest'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1050000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'openai/gpt-5.5-pro',
        label: 'OpenAI GPT-5.5 Pro (2026-04-23)',
        tags: ['tools', 'vision', 'reasoning', 'pro'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1050000,
          maxOutput: 128000,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'anthropic/claude-opus-4.7',
        label: 'Claude Opus 4.7 (2026-04-16)',
        tags: ['tools', 'vision', 'reasoning', 'latest'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1000000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'moonshotai/kimi-k2.6',
        label: 'Kimi K2.6 (2026-04-20)',
        tags: ['tools', 'vision', 'reasoning', 'open-weight'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 256000,
          maxOutput: 65536,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'deepseek/deepseek-v4-pro',
        label: 'DeepSeek V4 Pro (2026-04-23)',
        tags: ['tools', 'reasoning', 'cost-effective'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 1050000,
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'xiaomi/mimo-v2.5-pro',
        label: 'MiMo V2.5 Pro (2026-04-22)',
        tags: ['tools', 'vision', 'reasoning'],
        capabilities: {
          toolCalling: 'native',
          vision: true,
          streaming: 'partial',
          maxContext: 1048576,
          maxOutput: 131072,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
    ],
    provider: new KiloCodeProvider(),
  },
  ollama: {
    providerId: 'ollama',
    label: 'Ollama (Local)',
    envKey: 'OLLAMA_API_KEY',
    defaultBaseUrl: 'http://localhost:11434/v1',
    modelsUrl: 'http://localhost:11434/v1/models',
    defaultModel: 'llama3.3',
    defaultModelVerified: true,
    note: 'Local Ollama server.',
    isLocal: true,
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
    models: [
      {
        id: 'llama4:70b',
        label: 'Llama 4 70B',
        tags: ['tools', 'local', 'latest'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 131072,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'deepseek-v4',
        label: 'DeepSeek V4 (Local)',
        tags: ['moe', 'local'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 131072,
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
      {
        id: 'llama3.3',
        label: 'Llama 3.3',
        tags: ['tools', 'verified', 'local'],
        capabilities: {
          toolCalling: 'native',
          vision: false,
          streaming: 'partial',
          maxContext: 'varies',
          maxOutput: 'varies',
          reasoning: true,
          supportsSystemPrompt: true,
        },
      },
    ],
    provider: new OllamaProvider(),
  },
} satisfies Record<ProviderId, ProviderRegistryEntry>

export const PROVIDER_IDS = Object.keys(PROVIDER_REGISTRY) as ProviderId[]
export const DEFAULT_PROVIDER: ProviderId = 'anthropic'

export function getProviderRegistryEntry(provider: ProviderId): ProviderRegistryEntry {
  return PROVIDER_REGISTRY[provider]
}

export function getProviderModelInfo(provider: ProviderId, model: string): ProviderModelInfo | undefined {
  return PROVIDER_REGISTRY[provider]?.models.find(entry => entry.id === model)
}

export function getProviderOptions(provider: ProviderId) {
  const providerEntry = getProviderRegistryEntry(provider)
  return {
    envKey: providerEntry.envKey,
    baseUrl: providerEntry.defaultBaseUrl,
    defaultModel: providerEntry.defaultModel,
    defaultModelVerified: providerEntry.defaultModelVerified,
    note: providerEntry.note,
    capabilities: providerEntry.capabilities,
  }
}

export function createProviderInstance(provider: ProviderId): ProviderInterface {
  return getProviderRegistryEntry(provider).provider
}
