import { APIError } from '@anthropic-ai/sdk';
import { extractRateLimitsFromHeaders, parseRetryAfter } from '../rateLimits.js';
import { normalizeUsage } from '../usageNormalizer.js';
import type { ProviderClient, ProviderId, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js';

const DEFAULT_CHAT_PATH = '/chat/completions';
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

function isRetryableUpstreamFailure(status: number, message: string): boolean {
  if (status !== 400) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('upstream request failed') || normalized.includes('error from provider (console)');
}

export interface OpenAICompatibleOptions {
  /** Per-request timeout in ms (default: 300000 / 5 min).  Use env OPENAI_COMPATIBLE_TIMEOUT for global override. */
  timeoutMs?: number;
  /** Set false when the provider has zero vision-capable models (e.g. DeepSeek). */
  supportsVision?: boolean;
  /** Max automatic retries for rate-limit / server errors (default: 2). */
  maxRetries?: number;
  /** Extra HTTP headers to include in every request. */
  extraHeaders?: Record<string, string>;
  /** Callback for invalid streaming chunks (for logging/monitoring). */
  onStreamingWarning?: (chunk: string, error: Error) => void;
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

function baseUrlEnvVar(providerId: string): string {
  return `${providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_BASE_URL`;
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

    const hasImage = content.some(
      part => part && typeof part === 'object' && (part as Record<string, unknown>).type === 'image_url',
    );
    if (!hasImage) return message;

    // Replace image parts with a text notice; keep all other parts intact.
    const sanitized = content
      .filter(part => !(part && typeof part === 'object' && (part as Record<string, unknown>).type === 'image_url'))
      .concat([{ type: 'text', text: `[Image not sent - ${model} does not support vision]` }]);

    return { ...record, content: sanitized };
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
  private _onStreamingWarning?: (chunk: string, error: Error) => void;

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
    this._onStreamingWarning = options?.onStreamingWarning;
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
    let apiKey = this.requiresApiKey ? (options.apiKey ?? process.env[this.envKey]) : undefined;

    // Trim whitespace from API key to catch common mistakes (spaces, tabs, newlines)
    if (typeof apiKey === 'string') {
      apiKey = apiKey.trim();
    }

    if (this.requiresApiKey && !apiKey) {
      throw new Error(`Missing API key for provider ${this.providerId}. Set ${this.envKey}.`);
    }

    const baseUrl = options.baseUrl ?? process.env[baseUrlEnvVar(this.providerId)] ?? this.defaultBaseUrl;
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

            // Add response_format if structured outputs are requested
            const finalParams = {
              ...requestParams,
              stream: isStreaming,
              ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
            };

            const body = JSON.stringify(finalParams);

            // Retry loop for rate limits and transient server errors
            for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
              // Once a 2xx response is received the request has been consumed
              // server-side; re-POSTing on a body-parse failure would double-bill.
              let receivedOk = false;

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
                  if (
                    (RETRYABLE_STATUSES.has(response.status) || isRetryableUpstreamFailure(response.status, message)) &&
                    attempt < this.maxRetries
                  ) {
                    // Respect Retry-After header on 429 responses (in seconds or HTTP-date format)
                    let delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 10000);
                    if (response.status === 429) {
                      const retryAfter = response.headers.get('Retry-After');
                      if (retryAfter) {
                        delay = parseRetryAfter(retryAfter);
                      }
                    }
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

                receivedOk = true;

                if (isStreaming) {
                  return this.handleStreamingResponse(response);
                }

                const data = await response.json();
                return this.normalizeResponse(data, response);
              } catch (err) {
                clearTimeout(timeoutId);

                // Already formatted, or the server already accepted the
                // request (2xx) — not retryable
                if (err instanceof APIError || receivedOk) throw err;

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
    const baseUrl = options.baseUrl ?? process.env[baseUrlEnvVar(this.providerId)] ?? this.defaultBaseUrl;

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
    // BUG #28: Enforce a per-chunk stall timeout so a server that opens a
    // stream and then goes silent doesn't hang the request forever — the
    // original fetch() AbortController is cleared as soon as headers arrive.
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      while (true) {
        const stallPromise = new Promise<{ done: true; value: undefined; timedOut: true }>(resolve => {
          stallTimer = setTimeout(() => resolve({ done: true, value: undefined, timedOut: true }), this.timeoutMs);
        });

        const result = await Promise.race([
          reader.read().then(r => ({ ...r, timedOut: false as const })),
          stallPromise,
        ]);
        clearTimeout(stallTimer);

        if ('timedOut' in result && result.timedOut) {
          throw new Error(`Streaming response stalled after ${this.timeoutMs}ms with no data`);
        }
        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });
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
          } catch (error) {
            // Log invalid chunks for monitoring, but don't break the stream
            if (this._onStreamingWarning) {
              this._onStreamingWarning(data, error instanceof Error ? error : new Error(String(error)));
            }
          }
        }
      }
    } finally {
      // BUG #29: Release the reader lock (and cancel the underlying stream)
      // whenever this generator exits — including early `.return()` on a
      // `break` in the consumer's `for await` loop — to avoid leaking the
      // TCP connection and the lock on response.body.
      clearTimeout(stallTimer);
      try {
        await reader.cancel();
      } catch {
        // Ignore cancel errors — stream may already be closed/errored
      }
      reader.releaseLock();
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
