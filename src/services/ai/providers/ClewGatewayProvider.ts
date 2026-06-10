import { APIError } from '@anthropic-ai/sdk';
import { normalizeUsage } from '../usageNormalizer.js';
import type { ProviderClient, ProviderId, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js';

/**
 * Clew Gateway provider — routes through a self-hosted Clew Gateway instance.
 *
 * Env vars:
 * - CLEW_GATEWAY_URL: Gateway base URL (e.g. http://localhost:8787/v1)
 * - CLEW_GATEWAY_KEY: Virtual API key (e.g. clew_live_xxxxx)
 * - CLEW_MODEL: Optional default model alias (default: clew-code)
 */
export class ClewGatewayProvider implements ProviderInterface {
  readonly providerId: ProviderId = 'clew-gateway' as ProviderId;
  readonly label = 'Clew Gateway';

  getProviderId() {
    return this.providerId;
  }

  getProviderLabel() {
    return this.label;
  }

  getProviderApiKeyEnvVar() {
    return 'CLEW_GATEWAY_KEY';
  }

  async createClient(options: ProviderInitOptions): Promise<ProviderClient> {
    const apiKey = options.apiKey ?? process.env.CLEW_GATEWAY_KEY;
    const baseUrl = options.baseUrl ?? process.env.CLEW_GATEWAY_URL ?? 'http://localhost:8787/v1';

    if (!apiKey) {
      throw new Error('Missing Clew Gateway key. Set CLEW_GATEWAY_KEY.');
    }

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
            const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({ ...params, stream: isStreaming }),
            });

            if (!response.ok) {
              const text = await response.text();
              let errorData: Record<string, unknown>;
              try {
                errorData = JSON.parse(text);
              } catch {
                errorData = { error: { message: text || `${response.status} ${response.statusText}` } };
              }
              throw APIError.generate(
                response.status,
                errorData,
                typeof errorData.error === 'object'
                  ? (((errorData.error as Record<string, unknown>)?.message as string) ?? text)
                  : text,
                response.headers,
              );
            }

            if (isStreaming) {
              // Stream SSE pass-through
              const reader = response.body?.getReader();
              if (!reader) throw new Error('No response body for streaming');

              return this.handleStreamingResponse(reader);
            }

            const data = await response.json();
            return {
              ...data,
              _normalized: true,
              _provider: 'clew-gateway',
              _gateway_metadata: {
                provider: response.headers.get('x-clew-provider'),
                model: response.headers.get('x-clew-model'),
                fallbackUsed: response.headers.get('x-clew-fallback-used'),
                attempts: response.headers.get('x-clew-attempts'),
                chain: response.headers.get('x-clew-fallback-chain'),
              },
              usage: normalizeUsage(data, 'clew-gateway'),
            };
          },
        },
      },
    };
  }

  async listModels(options: ProviderInitOptions): Promise<Array<{ id: string; label: string }>> {
    const apiKey = options.apiKey ?? process.env.CLEW_GATEWAY_KEY;
    const baseUrl = options.baseUrl ?? process.env.CLEW_GATEWAY_URL ?? 'http://localhost:8787/v1';

    if (!apiKey) return [];

    const normalizedUrl = baseUrl.replace(/\/$/, '');

    try {
      const response = await fetch(`${normalizedUrl}/models`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) return [];

      const data = await response.json();
      if (!data || !Array.isArray(data.data)) return [];

      return data.data.map((m: any) => ({
        id: m.id,
        label: `${m.id} (Clew Gateway) — ${m.owned_by ?? 'clew-gateway'}`,
      }));
    } catch (error) {
      console.error('[clew-gateway] Failed to list models:', error);
      return [];
    }
  }

  private async *handleStreamingResponse(
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ): AsyncGenerator<unknown, void, unknown> {
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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          yield { ...parsed, _provider: 'clew-gateway' };
        } catch {
          // Skip invalid JSON chunks
        }
      }
    }
  }
}
