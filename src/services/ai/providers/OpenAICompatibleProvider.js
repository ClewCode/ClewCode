import { APIError } from '@anthropic-ai/sdk';
import { normalizeUsage } from '../usageNormalizer.js';

const DEFAULT_CHAT_PATH = '/chat/completions';
function safeParseErrorBody(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}
function extractErrorMessage(body, fallback) {
  const nestedError = body?.error;
  if (nestedError && typeof nestedError === 'object') {
    const message = nestedError.message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  const message = body?.message;
  if (typeof message === 'string' && message.length > 0) return message;
  const detail = body?.detail;
  if (typeof detail === 'string' && detail.length > 0) return detail;
  const error = body?.error;
  if (typeof error === 'string' && error.length > 0) return error;
  return fallback;
}
function getChatCompletionsUrl(baseUrl, chatPath = DEFAULT_CHAT_PATH) {
  const normalized = baseUrl.replace(/\/$/, '');
  return normalized.endsWith(chatPath) ? normalized : `${normalized}${chatPath}`;
}
export class OpenAICompatibleProvider {
  providerId;
  label;
  envKey;
  defaultBaseUrl;
  requiresApiKey;
  /** Override in subclass for non-standard endpoints (e.g. Cohere uses /chat) */
  chatPath = DEFAULT_CHAT_PATH;
  constructor(providerId, label, envKey, defaultBaseUrl, requiresApiKey = true) {
    this.providerId = providerId;
    this.label = label;
    this.envKey = envKey;
    this.defaultBaseUrl = defaultBaseUrl;
    this.requiresApiKey = requiresApiKey;
  }
  /**
   * Override to add extra HTTP headers for requests (e.g., HTTP-Referer, X-Title).
   * Headers are merged into the default Content-Type and Authorization headers.
   */
  getExtraHeaders() {
    return {};
  }
  getProviderId() {
    return this.providerId;
  }
  getProviderLabel() {
    return this.label;
  }
  getProviderApiKeyEnvVar() {
    return this.envKey;
  }
  async createClient(options) {
    const apiKey = this.requiresApiKey ? (options.apiKey ?? process.env[this.envKey]) : undefined;
    if (this.requiresApiKey && !apiKey) {
      throw new Error(`Missing API key for provider ${this.providerId}. Set ${this.envKey}.`);
    }
    const baseUrl = options.baseUrl ?? process.env[`${this.providerId.toUpperCase()}_BASE_URL`] ?? this.defaultBaseUrl;
    return {
      chat: {
        completions: {
          create: async params => {
            const isStreaming = params.stream === true;
            const headers = {
              'Content-Type': 'application/json',
              ...this.getExtraHeaders(),
            };
            if (apiKey) {
              headers.Authorization = `Bearer ${apiKey}`;
            }
            const response = await fetch(getChatCompletionsUrl(baseUrl, this.chatPath), {
              method: 'POST',
              headers,
              body: JSON.stringify({ ...params, stream: isStreaming }),
            });
            if (!response.ok) {
              const text = await response.text();
              const body = safeParseErrorBody(text);
              const message = extractErrorMessage(body, text || `${response.status} ${response.statusText}`);
              throw APIError.generate(
                response.status,
                body ?? {
                  error: {
                    message,
                    type: response.status === 429 ? 'rate_limit_error' : 'api_error',
                  },
                },
                message,
                response.headers,
              );
            }
            if (isStreaming) {
              return this.handleStreamingResponse(response);
            }
            const data = await response.json();
            return this.normalizeResponse(data, response);
          },
        },
      },
    };
  }
  async listModels(options) {
    const apiKey = options.apiKey ?? process.env[this.envKey];
    const baseUrl = options.baseUrl ?? process.env[`${this.providerId.toUpperCase()}_BASE_URL`] ?? this.defaultBaseUrl;
    const headers = {
      'Content-Type': 'application/json',
      ...this.getExtraHeaders(),
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
    const modelsUrl = normalizedBaseUrl.endsWith('/models') ? normalizedBaseUrl : `${normalizedBaseUrl}/models`;
    try {
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers,
      });
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.data)) {
        return [];
      }
      return data.data.map(m => ({
        id: m.id,
        label: m.id,
      }));
    } catch (error) {
      console.error(`[${this.providerId}] Failed to list models:`, error);
      return [];
    }
  }
  async *handleStreamingResponse(response) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed?.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          yield this.normalizeStreamChunk(parsed);
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
  normalizeResponse(data, _response) {
    return {
      ...data,
      _normalized: true,
      _provider: this.providerId,
      usage: normalizeUsage(data, this.providerId),
    };
  }
  normalizeStreamChunk(chunk) {
    return {
      ...chunk,
      _provider: this.providerId,
    };
  }
}
