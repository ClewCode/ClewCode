import { APIError } from '@anthropic-ai/sdk';
import { normalizeUsage } from '../usageNormalizer.js';
import type { ProviderClient, ProviderId, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js';

const DEFAULT_CHAT_PATH = '/chat/completions';

function safeParseErrorBody(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function extractErrorMessage(body: Record<string, unknown> | undefined, fallback: string): string {
  const nestedError = body?.error;
  if (nestedError && typeof nestedError === 'object') {
    const message = (nestedError as Record<string, unknown>).message;
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

function getChatCompletionsUrl(baseUrl: string, chatPath: string = DEFAULT_CHAT_PATH): string {
  const normalized = baseUrl.replace(/\/$/, '');
  return normalized.endsWith(chatPath) ? normalized : `${normalized}${chatPath}`;
}

export class OpenAICompatibleProvider implements ProviderInterface {
  readonly providerId: ProviderId;
  readonly label: string;
  readonly envKey: string;
  readonly defaultBaseUrl: string;
  protected requiresApiKey: boolean;
  /** Override in subclass for non-standard endpoints (e.g. Cohere uses /chat) */
  protected chatPath: string = DEFAULT_CHAT_PATH;

  constructor(providerId: ProviderId, label: string, envKey: string, defaultBaseUrl: string, requiresApiKey = true) {
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
  protected getExtraHeaders(): Record<string, string> {
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

  async createClient(options: ProviderInitOptions): Promise<ProviderClient> {
    const apiKey = this.requiresApiKey ? (options.apiKey ?? process.env[this.envKey]) : undefined;

    if (this.requiresApiKey && !apiKey) {
      throw new Error(`Missing API key for provider ${this.providerId}. Set ${this.envKey}.`);
    }

    const baseUrl = options.baseUrl ?? process.env[`${this.providerId.toUpperCase()}_BASE_URL`] ?? this.defaultBaseUrl;

    return {
      chat: {
        completions: {
          create: async (params: {
            model: string;
            messages: unknown;
            max_tokens?: number;
            temperature?: number;
            stream?: boolean;
            [key: string]: unknown;
          }) => {
            const isStreaming = params.stream === true;
            const headers: Record<string, string> = {
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

  async listModels(options: ProviderInitOptions): Promise<Array<{ id: string; label: string }>> {
    const apiKey = options.apiKey ?? process.env[this.envKey];
    const baseUrl = options.baseUrl ?? process.env[`${this.providerId.toUpperCase()}_BASE_URL`] ?? this.defaultBaseUrl;

    const headers: Record<string, string> = {
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

      return data.data.map((m: any) => ({
        id: m.id,
        label: m.id,
      }));
    } catch (error) {
      console.error(`[${this.providerId}] Failed to list models:`, error);
      return [];
    }
  }

  protected async *handleStreamingResponse(response: Response): AsyncGenerator<unknown, void, unknown> {
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

  protected normalizeResponse(data: unknown, _response?: Response): unknown {
    return {
      ...(data as Record<string, unknown>),
      _normalized: true,
      _provider: this.providerId,
      usage: normalizeUsage(data, this.providerId),
    };
  }

  protected normalizeStreamChunk(chunk: unknown): unknown {
    return {
      ...(chunk as Record<string, unknown>),
      _provider: this.providerId,
    };
  }
}
