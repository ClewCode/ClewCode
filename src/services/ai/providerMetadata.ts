import type { ProviderId } from './providers/ProviderInterface.js'

export type ProviderStreamingSupport = 'full' | 'partial' | 'none'

export interface ProviderCapabilities {
  chat: boolean
  streaming: ProviderStreamingSupport
  toolCalling: boolean
  vision: boolean
  jsonSchema: boolean
  reasoningEffort: boolean
  contextLength: string
}

export interface ProviderMetadata {
  label: string
  envKey: string
  baseUrl: string
  defaultModel?: string
  defaultModelVerified?: boolean
  note?: string
  capabilities: ProviderCapabilities
}

export const PROVIDER_METADATA: Record<ProviderId, ProviderMetadata> = {
  anthropic: {
    label: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultModelVerified: true,
    note: 'Full Claude Code pipeline. Best supported provider in this runtime.',
    capabilities: {
      chat: true,
      streaming: 'full',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: '100k+',
    },
  },
  openai: {
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    defaultModelVerified: true,
    note: 'OpenAI-compatible provider with function calling support.',
    capabilities: {
      chat: true,
      streaming: 'full',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
  google: {
    label: 'Google',
    envKey: 'GOOGLE_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    defaultModelVerified: true,
    note: 'Google Gemini via OpenAI-compatible endpoint.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
  gemini: {
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    defaultModelVerified: true,
    note: 'Google Gemini via OpenAI-compatible endpoint.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: true,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
  openrouter: {
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: undefined,
    defaultModelVerified: false,
    note: 'OpenRouter is OpenAI-compatible; fetch supported models from the endpoint.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
  opencode: {
    label: 'OpenCode',
    envKey: 'OPENCODE_API_KEY',
    baseUrl: 'https://opencode.ai/zen/v1',
    defaultModel: undefined,
    defaultModelVerified: false,
    note: 'OpenCode is OpenAI-compatible; verify models with the endpoint before using.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
  cline: {
    label: 'Cline API',
    envKey: 'CLINE_API_KEY',
    baseUrl: 'https://api.cline.bot/api/v1',
    defaultModel: undefined,
    defaultModelVerified: false,
    note: 'Cline is OpenAI-compatible; verify supported models before use.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
  groq: {
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: undefined,
    defaultModelVerified: false,
    note: 'Groq uses OpenAI-compatible API; verify models against the endpoint.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
  xai: {
    label: 'xAI',
    envKey: 'XAI_API_KEY',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: undefined,
    defaultModelVerified: false,
    note: 'xAI uses OpenAI-compatible chat/completions; verify model name before use.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
  mistral: {
    label: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    defaultModelVerified: true,
    note: 'Mistral via OpenAI-compatible API.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
  kilocode: {
    label: 'KiloCode',
    envKey: 'KILOCODE_API_KEY',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    defaultModel: 'kilo-auto/free',
    defaultModelVerified: true,
    note: 'KiloCode AI gateway.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
  ollama: {
    label: 'Ollama (Local)',
    envKey: 'OLLAMA_API_KEY',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.3',
    defaultModelVerified: true,
    note: 'Local Ollama server; model names depend on the local install.',
    capabilities: {
      chat: true,
      streaming: 'partial',
      toolCalling: true,
      vision: false,
      jsonSchema: true,
      reasoningEffort: true,
      contextLength: 'varies',
    },
  },
}
