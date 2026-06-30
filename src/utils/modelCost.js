import { logEvent } from 'src/services/analytics/index.js';
import { setHasUnknownModelCost } from '../bootstrap/state.js';
import { calculateUsageCost } from '../services/ai/usageTypes.js';
import {
  CLAUDE_3_5_HAIKU_CONFIG,
  CLAUDE_3_5_V2_SONNET_CONFIG,
  CLAUDE_3_7_SONNET_CONFIG,
  CLAUDE_HAIKU_4_5_CONFIG,
  CLAUDE_OPUS_4_1_CONFIG,
  CLAUDE_OPUS_4_5_CONFIG,
  CLAUDE_OPUS_4_7_CONFIG,
  CLAUDE_OPUS_4_CONFIG,
  CLAUDE_SONNET_4_5_CONFIG,
  CLAUDE_SONNET_4_7_CONFIG,
  CLAUDE_SONNET_4_CONFIG,
} from './model/configs.js';
import { firstPartyNameToCanonical, getCanonicalName, getDefaultMainLoopModelSetting } from './model/model.js';
export const PROVIDER_PRICING = {
  anthropic: {
    'claude-3-haiku': {
      inputTokens: 0.25,
      outputTokens: 1.25,
      promptCacheWriteTokens: 0.3,
      promptCacheReadTokens: 0.03,
      webSearchRequests: 0.01,
    },
    'claude-3.5-haiku': {
      inputTokens: 0.8,
      outputTokens: 4,
      promptCacheWriteTokens: 1,
      promptCacheReadTokens: 0.08,
      webSearchRequests: 0.01,
    },
    'claude-3.5-sonnet': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 3.75,
      promptCacheReadTokens: 0.3,
      webSearchRequests: 0.01,
    },
    'claude-3.7-sonnet': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 3.75,
      promptCacheReadTokens: 0.3,
      webSearchRequests: 0.01,
    },
    'claude-sonnet-4-20250514': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 3.75,
      promptCacheReadTokens: 0.3,
      webSearchRequests: 0.01,
    },
    'claude-sonnet-4.5-20250514': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 3.75,
      promptCacheReadTokens: 0.3,
      webSearchRequests: 0.01,
    },
    'claude-sonnet-4.6-20250514': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 3.75,
      promptCacheReadTokens: 0.3,
      webSearchRequests: 0.01,
    },
    'claude-haiku-3-20250704': {
      inputTokens: 1,
      outputTokens: 5,
      promptCacheWriteTokens: 1.25,
      promptCacheReadTokens: 0.1,
      webSearchRequests: 0.01,
    },
    'claude-opus-4-20250514': {
      inputTokens: 15,
      outputTokens: 75,
      promptCacheWriteTokens: 18.75,
      promptCacheReadTokens: 1.5,
      webSearchRequests: 0.01,
    },
    'claude-opus-4.1-20250514': {
      inputTokens: 15,
      outputTokens: 75,
      promptCacheWriteTokens: 18.75,
      promptCacheReadTokens: 1.5,
      webSearchRequests: 0.01,
    },
    'claude-opus-4.5-20250514': {
      inputTokens: 5,
      outputTokens: 25,
      promptCacheWriteTokens: 6.25,
      promptCacheReadTokens: 0.5,
      webSearchRequests: 0.01,
    },
    'claude-opus-4.6-20250514': {
      inputTokens: 5,
      outputTokens: 25,
      promptCacheWriteTokens: 6.25,
      promptCacheReadTokens: 0.5,
      webSearchRequests: 0.01,
    },
    'claude-opus-4.7-20250514': {
      inputTokens: 5,
      outputTokens: 25,
      promptCacheWriteTokens: 6.25,
      promptCacheReadTokens: 0.5,
      webSearchRequests: 0.01,
    },
  },
  openai: {
    'gpt-4o': {
      inputTokens: 2.5,
      outputTokens: 10,
      promptCacheWriteTokens: 3.125,
      promptCacheReadTokens: 0.25,
      webSearchRequests: 0.01,
    },
    'gpt-4o-mini': {
      inputTokens: 0.075,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0.09375,
      promptCacheReadTokens: 0.0075,
      webSearchRequests: 0.01,
    },
    'gpt-4-turbo': {
      inputTokens: 10,
      outputTokens: 30,
      promptCacheWriteTokens: 10,
      promptCacheReadTokens: 1,
      webSearchRequests: 0.01,
    },
    'gpt-4': {
      inputTokens: 30,
      outputTokens: 60,
      promptCacheWriteTokens: 30,
      promptCacheReadTokens: 3,
      webSearchRequests: 0.01,
    },
    'gpt-3.5-turbo': {
      inputTokens: 0.5,
      outputTokens: 1.5,
      promptCacheWriteTokens: 0.5,
      promptCacheReadTokens: 0.05,
      webSearchRequests: 0.01,
    },
    o1: {
      inputTokens: 15,
      outputTokens: 60,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0.01,
    },
    'o1-mini': {
      inputTokens: 3,
      outputTokens: 12,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0.01,
    },
    'o1-preview': {
      inputTokens: 15,
      outputTokens: 60,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0.01,
    },
    o3: {
      inputTokens: 10,
      outputTokens: 40,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0.01,
    },
    'o3-mini': {
      inputTokens: 1,
      outputTokens: 4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0.01,
    },
    'gpt-5.4-mini': {
      inputTokens: 0.75,
      outputTokens: 4.5,
      promptCacheWriteTokens: 0.9375,
      promptCacheReadTokens: 0.075,
      webSearchRequests: 0.01,
    },
    'gpt-5.4': {
      inputTokens: 2.5,
      outputTokens: 15,
      promptCacheWriteTokens: 3.125,
      promptCacheReadTokens: 0.25,
      webSearchRequests: 0.01,
    },
    'gpt-5.5': {
      inputTokens: 5,
      outputTokens: 30,
      promptCacheWriteTokens: 6.25,
      promptCacheReadTokens: 0.5,
      webSearchRequests: 0.01,
    },
    'gpt-5.5-pro': {
      inputTokens: 15,
      outputTokens: 75,
      promptCacheWriteTokens: 18.75,
      promptCacheReadTokens: 1.5,
      webSearchRequests: 0.01,
    },
  },
  google: {
    'gemini-1.5-flash': {
      inputTokens: 0.075,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'gemini-1.5-flash-8b': {
      inputTokens: 0.075,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'gemini-1.5-pro': {
      inputTokens: 1.25,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'gemini-2.0-flash': {
      inputTokens: 0.1,
      outputTokens: 0.4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'gemini-2.0-flash-lite': {
      inputTokens: 0.1,
      outputTokens: 0.4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'gemini-2.5-pro': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'gemini-2.5-flash': {
      inputTokens: 0.1,
      outputTokens: 0.4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'gemini-2.5-flash-lite': {
      inputTokens: 0.1,
      outputTokens: 0.4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  deepseek: {
    'deepseek-chat': {
      inputTokens: 0.14,
      outputTokens: 0.28,
      promptCacheWriteTokens: 0.14,
      promptCacheReadTokens: 0.028,
      webSearchRequests: 0,
    },
    'deepseek-coder': {
      inputTokens: 0.14,
      outputTokens: 0.28,
      promptCacheWriteTokens: 0.14,
      promptCacheReadTokens: 0.028,
      webSearchRequests: 0,
    },
    'deepseek-reasoner': {
      inputTokens: 0.55,
      outputTokens: 1.1,
      promptCacheWriteTokens: 0.55,
      promptCacheReadTokens: 0.11,
      webSearchRequests: 0,
    },
    'deepseek-v4-flash': {
      inputTokens: 0.14,
      outputTokens: 0.28,
      promptCacheWriteTokens: 0.14,
      promptCacheReadTokens: 0.028,
      webSearchRequests: 0,
    },
    'deepseek-v4-pro': {
      inputTokens: 0.435,
      outputTokens: 0.87,
      promptCacheWriteTokens: 0.435,
      promptCacheReadTokens: 0.03625,
      webSearchRequests: 0,
    },
  },
  sakana: {
    'fugu-ultra': {
      inputTokens: 5,
      outputTokens: 30,
      promptCacheWriteTokens: 5,
      promptCacheReadTokens: 0.5,
      webSearchRequests: 0,
    },
    'fugu-ultra-20260615': {
      inputTokens: 5,
      outputTokens: 30,
      promptCacheWriteTokens: 5,
      promptCacheReadTokens: 0.5,
      webSearchRequests: 0,
    },
    fugu: {
      inputTokens: 1,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  xai: {
    'grok-2': {
      inputTokens: 2,
      outputTokens: 10,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'grok-2-vision': {
      inputTokens: 2,
      outputTokens: 10,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'grok-3': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'grok-3-mini': {
      inputTokens: 0.6,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  meta: {
    'llama-3.3-70b-instruct': {
      inputTokens: 0.88,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'llama-3.1-405b-instruct': {
      inputTokens: 3.5,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'llama-3.1-70b-instruct': {
      inputTokens: 0.7,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'llama-3.1-8b-instruct': {
      inputTokens: 0.2,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'llama-3-8b-instruct': {
      inputTokens: 0.2,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'llama-3-70b-instruct': {
      inputTokens: 0.7,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  mistralai: {
    'mistral-large-latest': {
      inputTokens: 2,
      outputTokens: 6,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'mistral-small-latest': {
      inputTokens: 0.3,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'mistral-nemo': {
      inputTokens: 0.15,
      outputTokens: 0.15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'pixtral-large-latest': {
      inputTokens: 2,
      outputTokens: 6,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  cohere: {
    'command-r-plus': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'command-r': {
      inputTokens: 0.5,
      outputTokens: 1.5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'command-augment-24-08': {
      inputTokens: 1,
      outputTokens: 4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  amazon: {
    'nova-micro': {
      inputTokens: 0.035,
      outputTokens: 0.14,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'nova-lite': {
      inputTokens: 0.075,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'nova-pro': {
      inputTokens: 0.6,
      outputTokens: 2.4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  openrouter: {
    // OpenRouter aggregates many providers - prices vary by model
    // Auto routing
    'openrouter/auto': {
      inputTokens: 0.2,
      outputTokens: 1,
      promptCacheWriteTokens: 0.25,
      promptCacheReadTokens: 0.02,
      webSearchRequests: 0,
    },
    'openrouter/free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    // OpenAI models via OpenRouter
    'openai/gpt-4o': {
      inputTokens: 2.5,
      outputTokens: 10,
      promptCacheWriteTokens: 3.125,
      promptCacheReadTokens: 0.25,
      webSearchRequests: 0,
    },
    'openai/gpt-4o-mini': {
      inputTokens: 0.075,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0.09375,
      promptCacheReadTokens: 0.0075,
      webSearchRequests: 0,
    },
    'openai/gpt-4': {
      inputTokens: 30,
      outputTokens: 60,
      promptCacheWriteTokens: 30,
      promptCacheReadTokens: 3,
      webSearchRequests: 0,
    },
    'openai/gpt-4-turbo': {
      inputTokens: 10,
      outputTokens: 30,
      promptCacheWriteTokens: 10,
      promptCacheReadTokens: 1,
      webSearchRequests: 0,
    },
    'openai/o1': {
      inputTokens: 15,
      outputTokens: 60,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'openai/o3-mini': {
      inputTokens: 1,
      outputTokens: 4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // Anthropic models via OpenRouter
    'anthropic/claude-3.5-sonnet': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 3.75,
      promptCacheReadTokens: 0.3,
      webSearchRequests: 0,
    },
    'anthropic/claude-3.5-haiku': {
      inputTokens: 0.8,
      outputTokens: 4,
      promptCacheWriteTokens: 1,
      promptCacheReadTokens: 0.08,
      webSearchRequests: 0,
    },
    'anthropic/claude-opus-4': {
      inputTokens: 15,
      outputTokens: 75,
      promptCacheWriteTokens: 18.75,
      promptCacheReadTokens: 1.5,
      webSearchRequests: 0,
    },
    'anthropic/claude-sonnet-4': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 3.75,
      promptCacheReadTokens: 0.3,
      webSearchRequests: 0,
    },
    // Google models via OpenRouter
    'google/gemini-1.5-flash': {
      inputTokens: 0.075,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'google/gemini-1.5-pro': {
      inputTokens: 1.25,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'google/gemini-2.0-flash': {
      inputTokens: 0.1,
      outputTokens: 0.4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'google/gemini-2.5-flash': {
      inputTokens: 0.1,
      outputTokens: 0.4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'google/gemini-2.5-pro': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // DeepSeek models via OpenRouter
    'deepseek/deepseek-chat': {
      inputTokens: 0.14,
      outputTokens: 0.28,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'deepseek/deepseek-coder': {
      inputTokens: 0.14,
      outputTokens: 0.28,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'deepseek/deepseek-reasoner': {
      inputTokens: 0.55,
      outputTokens: 1.1,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // Meta models via OpenRouter
    'meta/llama-3.3-70b-instruct': {
      inputTokens: 0.88,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'meta/llama-3.1-405b-instruct': {
      inputTokens: 3.5,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'meta/llama-3.1-70b-instruct': {
      inputTokens: 0.7,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'meta/llama-3.1-8b-instruct': {
      inputTokens: 0.2,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // Mistral models via OpenRouter
    'mistralai/mistral-small': {
      inputTokens: 0.3,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'mistralai/mistral-large': {
      inputTokens: 2,
      outputTokens: 6,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // Cohere models via OpenRouter
    'cohere/command-r-plus': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'cohere/command-r': {
      inputTokens: 0.5,
      outputTokens: 1.5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // xAI Grok via OpenRouter
    'xai/grok-2': {
      inputTokens: 2,
      outputTokens: 10,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'xai/grok-2-vision': {
      inputTokens: 2,
      outputTokens: 10,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'xai/grok-3': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'xai/grok-3-mini': {
      inputTokens: 0.6,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // Qwen via OpenRouter
    'qwen/qwen-2-72b': {
      inputTokens: 0.72,
      outputTokens: 0.72,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'qwen/qwen-2-110b': {
      inputTokens: 1.1,
      outputTokens: 1.1,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // Amazon Nova via OpenRouter
    'amazon/nova-pro': {
      inputTokens: 0.6,
      outputTokens: 2.4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'amazon/nova-lite': {
      inputTokens: 0.075,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'amazon/nova-micro': {
      inputTokens: 0.035,
      outputTokens: 0.14,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // NVIDIA via OpenRouter
    'nvidia/nemotron-3-super-120b-a12b': {
      inputTokens: 0.6,
      outputTokens: 0.6,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // StepFun via OpenRouter
    'stepfun/step-3.5-flash': {
      inputTokens: 0.1,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    // Perplexity via OpenRouter
    'perplexity/llama-3.1-sonar-small-128k-chat': {
      inputTokens: 1,
      outputTokens: 1,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'perplexity/llama-3.1-sonar-large-128k-chat': {
      inputTokens: 5,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  azure: {
    // Azure OpenAI - pricing varies by deployment
    'gpt-4': {
      inputTokens: 30,
      outputTokens: 60,
      promptCacheWriteTokens: 30,
      promptCacheReadTokens: 3,
      webSearchRequests: 0,
    },
    'gpt-4-turbo': {
      inputTokens: 10,
      outputTokens: 30,
      promptCacheWriteTokens: 10,
      promptCacheReadTokens: 1,
      webSearchRequests: 0,
    },
    'gpt-35-turbo': {
      inputTokens: 0.5,
      outputTokens: 1.5,
      promptCacheWriteTokens: 0.5,
      promptCacheReadTokens: 0.05,
      webSearchRequests: 0,
    },
  },
  bedrock: {
    // AWS Bedrock - prices vary by region
    'anthropic.claude-3-haiku': {
      inputTokens: 0.25,
      outputTokens: 1.25,
      promptCacheWriteTokens: 0.3,
      promptCacheReadTokens: 0.03,
      webSearchRequests: 0,
    },
    'anthropic.claude-3.5-sonnet': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 3.75,
      promptCacheReadTokens: 0.3,
      webSearchRequests: 0,
    },
    'anthropic.claude-3-opus': {
      inputTokens: 15,
      outputTokens: 75,
      promptCacheWriteTokens: 18.75,
      promptCacheReadTokens: 1.5,
      webSearchRequests: 0,
    },
    'amazon.nova-micro': {
      inputTokens: 0.035,
      outputTokens: 0.14,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'amazon.nova-lite': {
      inputTokens: 0.075,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'amazon.nova-pro': {
      inputTokens: 0.6,
      outputTokens: 2.4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'meta.llama-3.3-70b-instruct': {
      inputTokens: 0.88,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'meta.llama-3.1-405b-instruct': {
      inputTokens: 3.5,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'mistral.mistral-large': {
      inputTokens: 2,
      outputTokens: 6,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  vertex: {
    // Google Vertex AI - prices vary by region
    'gemini-1.5-flash': {
      inputTokens: 0.075,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'gemini-1.5-pro': {
      inputTokens: 1.25,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'gemini-2.0-flash': {
      inputTokens: 0.1,
      outputTokens: 0.4,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'gemini-2.5-pro': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  huggingface: {
    // HuggingFace Inference - varies by model
    'microsoft/phi-4': {
      inputTokens: 0.1,
      outputTokens: 0.1,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'meta-llama/llama-3.3-70b-instruct': {
      inputTokens: 0.88,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'meta-llama/llama-3.1-405b-instruct': {
      inputTokens: 3.5,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'mistralai/mistral-nemo': {
      inputTokens: 0.15,
      outputTokens: 0.15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'google/gemma-2-27b-it': {
      inputTokens: 0.3,
      outputTokens: 0.3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  replicate: {
    // Replicate - varies by model
    'meta/llama-3.3-70b-instruct': {
      inputTokens: 0.88,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'meta/llama-3.1-405b-instruct': {
      inputTokens: 3.5,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'anthropic/claude-3.5-sonnet': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 3.75,
      promptCacheReadTokens: 0.3,
      webSearchRequests: 0,
    },
    'mistralai/mistral-large': {
      inputTokens: 2,
      outputTokens: 6,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  together: {
    // Together AI - varies by model
    'together/llama-3.3-70b-instruct': {
      inputTokens: 0.88,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'together/llama-3.1-405b-instruct': {
      inputTokens: 3.5,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'together/meta-llama-3.2-90b-instruct': {
      inputTokens: 0.9,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'together/qwen-72b-chat': {
      inputTokens: 0.72,
      outputTokens: 0.72,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  fireworks: {
    // Fireworks AI - varies by model
    'fireworks/llama-3.3-70b-instruct': {
      inputTokens: 0.88,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'fireworks/qwen-2-72b-chat': {
      inputTokens: 0.72,
      outputTokens: 0.72,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'fireworks/mixtral-8x22b-instruct': {
      inputTokens: 1.1,
      outputTokens: 1.1,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  novita: {
    // Novita AI
    'meta/llama-3.3-70b-instruct': {
      inputTokens: 0.7,
      outputTokens: 0.7,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'meta/llama-3.1-405b-instruct': {
      inputTokens: 2.8,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'deepseek/deepseek-chat': {
      inputTokens: 0.14,
      outputTokens: 0.28,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'qianwen/qwen-2-72b': {
      inputTokens: 0.72,
      outputTokens: 0.72,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  perplexity: {
    'llama-3.1-sonar-small-128k-chat': {
      inputTokens: 1,
      outputTokens: 1,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'llama-3.1-sonar-large-128k-chat': {
      inputTokens: 5,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'llama-3.1-sonar-hybrid-128k': {
      inputTokens: 3,
      outputTokens: 3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  lepton: {
    // Lepton AI
    'llama-3.1-405b-instruct': {
      inputTokens: 3.5,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'llama-3.1-70b-instruct': {
      inputTokens: 0.7,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'llama-3.3-70b-instruct': {
      inputTokens: 0.88,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  qianwen: {
    // Alibaba Qianwen
    'qwen-turbo': {
      inputTokens: 0.2,
      outputTokens: 0.6,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'qwen-plus': {
      inputTokens: 1,
      outputTokens: 3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'qwen-max': {
      inputTokens: 4,
      outputTokens: 12,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'qwen-coder-turbo': {
      inputTokens: 0.2,
      outputTokens: 0.6,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  zhipu: {
    // ByteDance Zhipu
    'glm-4': {
      inputTokens: 0.2,
      outputTokens: 1,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'glm-4-flash': {
      inputTokens: 0.1,
      outputTokens: 0.1,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'glm-4-plus': {
      inputTokens: 1,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'glm-4-plus-long': {
      inputTokens: 2,
      outputTokens: 10,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  yi: {
    // 01.AI Yi models
    'yi-large': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'yi-medium': {
      inputTokens: 1,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'yi-spark': {
      inputTokens: 0.2,
      outputTokens: 1,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  moonshot: {
    // Moonshot AI (Kimi)
    'moonshot-v1-8k': {
      inputTokens: 0.6,
      outputTokens: 3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'moonshot-v1-32k': {
      inputTokens: 1,
      outputTokens: 5,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'moonshot-v1-128k': {
      inputTokens: 3,
      outputTokens: 15,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  minimax: {
    'abab6.5s-chat': {
      inputTokens: 0.3,
      outputTokens: 1,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
    'abab6.5g-chat': {
      inputTokens: 1,
      outputTokens: 3,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
    },
  },
  // Free/Trial providers (cost = $0)
  free: {
    // Kilo Auto Free tier
    'kilo-auto/free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    // Ollama local models (no API cost)
    llama2: {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    llama3: {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    mistral: {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    codellama: {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    phi: {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    gemma: {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    qwen: {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    mixtral: {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    // OpenRouter free tier models
    'inclusionai/ling-2.6-1t:free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    'tencent/hy3-preview:free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    'google/gemma-4-26b-a4b-it:free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    'google/gemma-4-31b-it:free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    'nvidia/nemotron-3-super-120b-a12b:free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    'openrouter/free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    // liquid free models
    'liquid/lfm-2.5-1.2b-thinking:free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    'liquid/lfm-2.5-1.2b-instruct:free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
    // minimax free
    'minimax/minimax-m2.5:free': {
      inputTokens: 0,
      outputTokens: 0,
      promptCacheWriteTokens: 0,
      promptCacheReadTokens: 0,
      webSearchRequests: 0,
      isFree: true,
    },
  },
};
// Default pricing tiers for Anthropic models
// Standard pricing tier for Sonnet models: $3 input / $15 output per Mtok
export const COST_TIER_3_15 = {
  inputTokens: 3,
  outputTokens: 15,
  promptCacheWriteTokens: 3.75,
  promptCacheReadTokens: 0.3,
  webSearchRequests: 0.01,
};
// Pricing tier for Opus 4/4.1: $15 input / $75 output per Mtok
export const COST_TIER_15_75 = {
  inputTokens: 15,
  outputTokens: 75,
  promptCacheWriteTokens: 18.75,
  promptCacheReadTokens: 1.5,
  webSearchRequests: 0.01,
};
// Pricing tier for Opus 4.5: $5 input / $25 output per Mtok
export const COST_TIER_5_25 = {
  inputTokens: 5,
  outputTokens: 25,
  promptCacheWriteTokens: 6.25,
  promptCacheReadTokens: 0.5,
  webSearchRequests: 0.01,
};
// Pricing for Haiku 3.5: $0.80 input / $4 output per Mtok
export const COST_HAIKU_35 = {
  inputTokens: 0.8,
  outputTokens: 4,
  promptCacheWriteTokens: 1,
  promptCacheReadTokens: 0.08,
  webSearchRequests: 0.01,
};
// Pricing for Haiku 4.5: $1 input / $5 output per Mtok
export const COST_HAIKU_45 = {
  inputTokens: 1,
  outputTokens: 5,
  promptCacheWriteTokens: 1.25,
  promptCacheReadTokens: 0.1,
  webSearchRequests: 0.01,
};
const DEFAULT_UNKNOWN_MODEL_COST = COST_TIER_5_25;
/**
 * Get the cost tier for Opus 4.6 based on fast mode.
 */
export function getOpus46CostTier() {
  return COST_TIER_5_25;
}
// @[MODEL LAUNCH]: Add a pricing entry for the new model below.
// Costs from https://platform.claude.com/docs/en/about-claude/pricing
// Web search cost: $10 per 1000 requests = $0.01 per request
export const MODEL_COSTS = {
  [firstPartyNameToCanonical(CLAUDE_3_5_HAIKU_CONFIG.firstParty)]: COST_HAIKU_35,
  [firstPartyNameToCanonical(CLAUDE_HAIKU_4_5_CONFIG.firstParty)]: COST_HAIKU_45,
  [firstPartyNameToCanonical(CLAUDE_3_5_V2_SONNET_CONFIG.firstParty)]: COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_3_7_SONNET_CONFIG.firstParty)]: COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_SONNET_4_CONFIG.firstParty)]: COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_SONNET_4_5_CONFIG.firstParty)]: COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_SONNET_4_7_CONFIG.firstParty)]: COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_CONFIG.firstParty)]: COST_TIER_15_75,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_1_CONFIG.firstParty)]: COST_TIER_15_75,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_5_CONFIG.firstParty)]: COST_TIER_5_25,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_7_CONFIG.firstParty)]: COST_TIER_5_25,
};
/**
 * Calculates the USD cost based on token usage and model cost configuration.
 * Accepts Anthropic's native `BetaUsage` (backward-compatible).
 */
function tokensToUSDCost(modelCosts, usage) {
  return (
    (usage.input_tokens / 1_000_000) * modelCosts.inputTokens +
    (usage.output_tokens / 1_000_000) * modelCosts.outputTokens +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * modelCosts.promptCacheReadTokens +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * modelCosts.promptCacheWriteTokens +
    (usage.server_tool_use?.web_search_requests ?? 0) * modelCosts.webSearchRequests
  );
}
/**
 * @[MULTI_PROVIDER] Get the cost rates for a model.
 * Uses PROVIDER_PRICING table for non-Anthropic models.
 * Speed info is only needed for Opus 4.6 fast-mode pricing.
 */
export function getModelCosts(model, speedInfo) {
  const shortName = getCanonicalName(model);
  // Check if this is an Opus 4.6 model with fast mode active.
  if (shortName === firstPartyNameToCanonical(CLAUDE_OPUS_4_7_CONFIG.firstParty)) {
    return getOpus46CostTier();
  }
  // Check Anthropic MODEL_COSTS first
  const costs = MODEL_COSTS[shortName];
  if (costs) {
    return costs;
  }
  // Try to find in PROVIDER_PRICING table
  const providerCost = lookupProviderPricing(model);
  if (providerCost) {
    return providerCost;
  }
  // Track and fallback
  trackUnknownModelCost(model, shortName);
  return MODEL_COSTS[getCanonicalName(getDefaultMainLoopModelSetting())] ?? DEFAULT_UNKNOWN_MODEL_COST;
}
/**
 * Look up pricing from provider pricing table by matching model ID.
 */
function lookupProviderPricing(model) {
  const modelLower = model.toLowerCase();
  const modelShort = getCanonicalName(model).toLowerCase();
  for (const [_provider, pricing] of Object.entries(PROVIDER_PRICING)) {
    // Try full model ID
    if (pricing[modelLower]) {
      return pricing[modelLower];
    }
    // Try short name
    if (pricing[modelShort]) {
      return pricing[modelShort];
    }
    // Try partial match (e.g., "gpt-4o" matches "gpt-4o-2024-11-20")
    for (const [pricingModelId, costs] of Object.entries(pricing)) {
      if (modelLower.includes(pricingModelId) || pricingModelId.includes(modelShort)) {
        return costs;
      }
    }
  }
  return null;
}
/**
 * Check if a model is free (no cost).
 */
export function isModelFree(model) {
  const costs = lookupProviderPricing(model);
  return costs?.isFree ?? false;
}
/**
 * Get the provider name for a model (if known).
 */
export function getModelProvider(model) {
  const modelLower = model.toLowerCase();
  const modelShort = getCanonicalName(model).toLowerCase();
  for (const [provider, pricing] of Object.entries(PROVIDER_PRICING)) {
    for (const [pricingModelId] of Object.entries(pricing)) {
      if (modelLower.includes(pricingModelId) || pricingModelId.includes(modelShort)) {
        return provider;
      }
    }
  }
  return null;
}
function trackUnknownModelCost(model, shortName) {
  logEvent('tengu_unknown_model_cost', {
    model: model,
    shortName: shortName,
  });
  setHasUnknownModelCost();
}
/**
 * @[MULTI_PROVIDER] Calculate the cost of a query in US dollars from a `Usage` object.
 * @deprecated Use `calculateUSDCostFromProviderUsage()` with `fromAnthropicUsage()` instead.
 */
export function calculateUSDCost(resolvedModel, usage) {
  const modelCosts = getModelCosts(resolvedModel, { speed: usage.speed });
  return tokensToUSDCost(modelCosts, usage);
}
/**
 * Calculate USD cost from a provider-agnostic `ProviderUsage` object.
 * Preferred for non-Anthropic providers; still works for Anthropic.
 *
 * @example
 *   import { fromOpenAIUsage } from '../services/ai/usageTypes.js'
 *   const usage = fromOpenAIUsage(response.usage)
 *   const cost = calculateUSDCostFromProviderUsage(model, usage)
 */
export function calculateUSDCostFromProviderUsage(resolvedModel, usage) {
  const modelCosts = getModelCosts(resolvedModel);
  return calculateUsageCost(usage, modelCosts);
}
/**
 * Like `calculateUSDCost` but takes raw token counts directly.
 * Provider-agnostic — no BetaUsage dependency.
 */
export function calculateCostFromTokensProviderAgnostic(model, tokens) {
  return calculateUSDCostFromProviderUsage(model, {
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cacheReadInputTokens: tokens.cacheReadInputTokens,
    cacheCreationInputTokens: tokens.cacheCreationInputTokens,
  });
}
/**
 * Calculate cost from raw token counts without requiring a full BetaUsage object.
 * Useful for side queries (e.g. classifier) that track token counts independently.
 */
export function calculateCostFromTokens(model, tokens) {
  const usage = {
    input_tokens: tokens.inputTokens,
    output_tokens: tokens.outputTokens,
    cache_read_input_tokens: tokens.cacheReadInputTokens,
    cache_creation_input_tokens: tokens.cacheCreationInputTokens,
  };
  return calculateUSDCost(model, usage);
}
function formatPrice(price) {
  // Format price: integers without decimals, others with 2 decimal places
  // e.g., 3 -> "$3", 0.8 -> "$0.80", 22.5 -> "$22.50"
  if (Number.isInteger(price)) {
    return `$${price}`;
  }
  return `$${price.toFixed(2)}`;
}
/**
 * Format model costs as a pricing string for display
 * e.g., "$3/$15 per Mtok"
 */
export function formatModelPricing(costs) {
  return `${formatPrice(costs.inputTokens)}/${formatPrice(costs.outputTokens)} per Mtok`;
}
/**
 * Get formatted pricing string for a model
 * Accepts either a short name or full model name
 * Returns undefined if model is not found
 */
export function getModelPricingString(model) {
  const shortName = getCanonicalName(model);
  const costs = MODEL_COSTS[shortName];
  if (!costs) return undefined;
  return formatModelPricing(costs);
}
