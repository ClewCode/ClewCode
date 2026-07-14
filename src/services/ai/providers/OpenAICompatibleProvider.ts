import { APIError } from '@anthropic-ai/sdk';
import { normalizeUsage } from '../usageNormalizer.js';
import type { ProviderClient, ProviderId, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js';

const DEFAULT_CHAT_PATH = '/chat/completions';
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export interface OpenAICompatibleOptions {
  /** Per-request timeout in ms (default: 300000 / 5 min).  Use env OPENAI_COMPATIBLE_TIMEOUT for global override. */
  timeoutMs?: number;
  /** Set false when the provider has zero vision-capable models (e.g. DeepSeek). */
  supportsVision?: boolean;
  /** Max automatic retries for rate-limit / server errors (default: 2). */
  maxRetries?: number;
  /** Extra HTTP headers to include in every request. */
  extraHeaders?: Record<string, string>;
}

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

function sanitizeMessagesForTextOnlyProvider(messages: unknown, model: string): unknown {
  if (!Array.isArray(messages)) return messages;

  return messages.map(message => {
    if (!message || typeof message !== 'object') return message;

    const record = message as Record<string, unknown>;
    const content = record.content;
    if (!Array.isArray(content)) return message;

    const textParts: string[] = [];
    let strippedMedia = false;

    for (const part of content) {
      if (!part || typeof part !== 'object') continue;

      const partRecord = part as Record<string, unknown>;
      if (partRecord.type === 'text' && typeof partRecord.text === 'string') {
        textParts.push(partRecord.text);
      } else if (partRecord.type === 'image_url') {
        strippedMedia = true;
      }
    }

    if (!strippedMedia) return message;

    return {
      ...record,
      content: [...textParts, `[Image not sent - ${model} does not support vision]`].filter(Boolean).join('\n'),
    };
  });
}

export class OpenAICompatibleProvider implements ProviderInterface {
  readonly providerId: ProviderId;
  readonly label: string;
  readonly envKey: string;
  readonly defaultBaseUrl: string;
  protected requiresApiKey: boolean;
  /** Override in subclass for non-standard endpoints (e.g. Cohere uses /chat) */
  protected chatPath: string = DEFAULT_CHAT_PATH;
  protected timeoutMs: number;
  protected maxRetries: number;
  private supportsVision: boolean;
  private _extraHeaders: Record<string, string>;

  constructor(
    providerId: ProviderId,
    label: string,
    envKey: string,
    defaultBaseUrl: string,
    requiresApiKey = true,
    options?: OpenAICompatibleOptions,
  ) {
    this.providerId = providerId;
    this.label = label;
    this.envKey = envKey;
    this.defaultBaseUrl = defaultBaseUrl;
    this.requiresApiKey = requiresApiKey;
    this.timeoutMs = options?.timeoutMs ?? (Number(process.env.OPENAI_COMPATIBLE_TIMEOUT) || DEFAULT_TIMEOUT_MS);
    this.supportsVision = options?.supportsVision ?? true;
    this.maxRetries = options?.maxRetries ?? 2;
    this._extraHeaders = options?.extraHeaders ?? {};
  }

  /**
   * Override to add extra HTTP headers for requests (e.g., HTTP-Referer, X-Title).
   * Constructor-supplied extraHeaders are included automatically.
   */
  protected getExtraHeaders(): Record<string, string> {
    return { ...this._extraHeaders };
  }

  /**
   * Override in subclasses or set via constructor `supportsVision` to strip
   * image content from messages for text-only providers (e.g. DeepSeek).
   */
  protected shouldStripImages(): boolean {
    return !this.supportsVision;
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
    const url = getChatCompletionsUrl(baseUrl, this.chatPath);

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

            const requestParams = this.shouldStripImages()
              ? { ...params, messages: sanitizeMessagesForTextOnlyProvider(params.messages, params.model) }
              : params;

            const body = JSON.stringify({ ...requestParams, stream: isStreaming });

            // Retry loop for rate limits and transient server errors
            for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

              try {
                const response = await fetch(url, {
                  method: 'POST',
                  headers,
                  body,
                  signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                  const text = await response.text();
                  const errBody = safeParseErrorBody(text);
                  const message = extractErrorMessage(errBody, text || `${response.status} ${response.statusText}`);

                  // Retry on rate limit (429) and server errors (502, 503, 504)
                  if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
                    const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                  }

                  throw APIError.generate(
                    response.status,
                    errBody ?? {
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
              } catch (err) {
                clearTimeout(timeoutId);

                // Already formatted — not retryable
                if (err instanceof APIError) throw err;

                // Retry on network / abort errors (timeout, connection reset, DNS)
                if (attempt < this.maxRetries) {
                  const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 10000);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  continue;
                }

                throw err;
              }
            }

            throw new Error(`${this.providerId}: all retry attempts exhausted`);
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
