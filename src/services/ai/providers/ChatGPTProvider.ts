import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { APIError } from '@anthropic-ai/sdk';
import type { BetaMessage, BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import {
  type ChatGPTTokens,
  type CodexAuth,
  createCodexFetch,
  deriveAccountId,
  ensureFreshTokens,
  listCodexModels,
  normalizeResponsesBody,
  type ReasoningEffort,
  resolveConfig,
} from '@opencoredev/loginwithchatgpt-core';
import { logError } from '../../../utils/log.js';
import { type CodexLimitsSnapshot, extractCodexLimitsFromResponse, getCodexLimits } from '../../codexLimits.js';
import { type ProviderAdapter, registerAdapter, withStreamWatchdog } from '../adapter/AnthropicAdapter.js';
import type { ProviderClient, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js';

const CODEX_AUTH_PATH = join(homedir(), '.codex', 'auth.json');
const CHATGPT_PROVIDER_ID = 'chatgpt' as const;

type ResponsesClient = {
  responses: {
    create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
  };
};

type OpenAIResponseInputItem = Record<string, unknown>;

function readCodexAuthFile(): Record<string, unknown> {
  if (!existsSync(CODEX_AUTH_PATH)) {
    throw new Error('ChatGPT provider is not authenticated. Run `codex login` first, then try again.');
  }
  return JSON.parse(readFileSync(CODEX_AUTH_PATH, 'utf8')) as Record<string, unknown>;
}

function normalizeCodexTokens(data: Record<string, unknown>): ChatGPTTokens | undefined {
  const source = (data.tokens && typeof data.tokens === 'object' ? data.tokens : data) as Record<string, unknown>;
  const accessToken = source.access_token ?? source.accessToken;
  if (typeof accessToken !== 'string' || accessToken.length === 0) return undefined;

  const refreshToken = source.refresh_token ?? source.refreshToken;
  const idToken = source.id_token ?? source.idToken;
  const accountId =
    source.account_id ?? source.accountId ?? deriveAccountId(typeof idToken === 'string' ? idToken : accessToken);
  const expiresAt = source.expires_at ?? source.expiresAt;

  return {
    accessToken,
    ...(typeof refreshToken === 'string' ? { refreshToken } : {}),
    ...(typeof idToken === 'string' ? { idToken } : {}),
    ...(typeof accountId === 'string' ? { accountId } : {}),
    ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
  };
}

function writeRefreshedTokens(original: Record<string, unknown>, tokens: ChatGPTTokens): void {
  const next = { ...original };
  const target = (
    next.tokens && typeof next.tokens === 'object' ? { ...(next.tokens as Record<string, unknown>) } : next
  ) as Record<string, unknown>;

  target.access_token = tokens.accessToken;
  if (tokens.refreshToken) target.refresh_token = tokens.refreshToken;
  if (tokens.idToken) target.id_token = tokens.idToken;
  if (tokens.accountId) target.account_id = tokens.accountId;
  if (tokens.expiresAt) target.expires_at = tokens.expiresAt;

  if (next.tokens && typeof next.tokens === 'object') {
    next.tokens = target;
  }

  writeFileSync(CODEX_AUTH_PATH, JSON.stringify(next, null, 2), 'utf8');
}

function createAuthResolver(config: ReturnType<typeof resolveConfig>): () => Promise<CodexAuth> {
  return async () => {
    const authFile = readCodexAuthFile();
    const tokens = normalizeCodexTokens(authFile);
    if (!tokens) {
      throw new Error('ChatGPT provider could not read Codex OAuth tokens. Run `codex login` again.');
    }

    const fresh = await ensureFreshTokens(config, tokens, {
      onRefresh: refreshed => writeRefreshedTokens(authFile, refreshed),
    });
    const accountId = fresh.accountId ?? deriveAccountId(fresh.idToken ?? fresh.accessToken);
    if (!accountId) {
      throw new Error('ChatGPT provider could not derive a ChatGPT account id from Codex OAuth tokens.');
    }

    return { accessToken: fresh.accessToken, accountId };
  };
}

async function parseErrorResponse(response: Response): Promise<Error> {
  const text = await response.text();
  let body: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    body = undefined;
  }
  const nested = body?.error;
  const message =
    (nested && typeof nested === 'object' && typeof (nested as Record<string, unknown>).message === 'string'
      ? ((nested as Record<string, unknown>).message as string)
      : undefined) ??
    (typeof body?.message === 'string' ? body.message : undefined) ??
    (text || `${response.status} ${response.statusText}`);

  return APIError.generate(response.status, body ?? { error: { message } }, message, response.headers);
}

async function* parseServerSentEvents(response: Response): AsyncGenerator<unknown, void, undefined> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body for ChatGPT stream');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';

    for (const eventBlock of events) {
      const dataLines = eventBlock
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart());
      if (dataLines.length === 0) continue;
      const data = dataLines.join('\n');
      if (data === '[DONE]') return;
      try {
        yield JSON.parse(data);
      } catch {
        // Ignore keepalive or malformed SSE frames from upstream.
      }
    }
  }
}

export class ChatGPTProvider implements ProviderInterface {
  readonly providerId = CHATGPT_PROVIDER_ID;
  readonly label = 'ChatGPT';

  getProviderId() {
    return this.providerId;
  }

  getProviderLabel() {
    return this.label;
  }

  getProviderApiKeyEnvVar() {
    return '';
  }

  async createClient(options: ProviderInitOptions): Promise<ProviderClient> {
    const config = resolveConfig({
      codexBaseUrl: options.baseUrl || process.env.CHATGPT_CODEX_BASE_URL,
      clientVersion: process.env.CHATGPT_CODEX_CLIENT_VERSION,
    });
    const getAuth = createAuthResolver(config);
    const codexFetch = createCodexFetch({
      config,
      getAuth,
      reasoningEffort: normalizeReasoningEffort(process.env.CHATGPT_REASONING_EFFORT),
      serviceTier: normalizeServiceTier(process.env.CHATGPT_SERVICE_TIER),
    });

    return {
      responses: {
        create: async (params: Record<string, unknown>, requestOptions?: { signal?: AbortSignal }) => {
          const stream = params.stream === true;
          const response = await codexFetch(`${config.codexBaseUrl}/responses`, {
            method: 'POST',
            headers: {
              accept: stream ? 'text/event-stream' : 'application/json',
              'content-type': 'application/json',
            },
            body: JSON.stringify(params),
            signal: requestOptions?.signal,
          });

          if (!response.ok) {
            throw await parseErrorResponse(response);
          }

          // Passive usage capture: rate-limit headers ride along on every
          // `/responses` reply (both stream and non-stream). Never let a
          // capture failure break the actual completion.
          extractCodexLimitsFromResponse(response.headers);

          return stream ? parseServerSentEvents(response) : response.json();
        },
      },
    } satisfies ResponsesClient;
  }

  async listModels(options: ProviderInitOptions): Promise<Array<{ id: string; label: string }>> {
    try {
      const config = resolveConfig({
        codexBaseUrl: options.baseUrl || process.env.CHATGPT_CODEX_BASE_URL,
        clientVersion: process.env.CHATGPT_CODEX_CLIENT_VERSION,
      });
      const slugs = await listCodexModels({ config, getAuth: createAuthResolver(config) });
      return slugs.map(id => ({ id, label: id }));
    } catch (error) {
      console.error('[chatgpt] Failed to list models:', error);
      return [];
    }
  }

  /**
   * Best-effort probe to populate Codex usage limits when no snapshot has been
   * captured from live traffic yet (fresh session, no request made). Fires one
   * minimal `/responses` request and reads the rate-limit headers / body off
   * the reply. Never throws; returns whatever snapshot exists afterward.
   */
  async fetchUsageSnapshot(options: { baseUrl?: string; model?: string }): Promise<CodexLimitsSnapshot | null> {
    try {
      const config = resolveConfig({
        codexBaseUrl: options.baseUrl || process.env.CHATGPT_CODEX_BASE_URL,
        clientVersion: process.env.CHATGPT_CODEX_CLIENT_VERSION,
      });
      const codexFetch = createCodexFetch({ config, getAuth: createAuthResolver(config) });
      // Model slugs may be provider-prefixed (e.g. "chatgpt/gpt-5.5").
      const model = (options.model ?? '').split('/').pop() || 'gpt-5.5';
      // The Codex backend rejects non-streaming `/responses` ("Stream must be
      // set to true"), so we must stream. The rate-limit headers arrive on the
      // initial response — we read them and immediately cancel the body, so the
      // probe costs a request but not a full generation.
      const body = normalizeResponsesBody(
        {
          model,
          input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
          stream: true,
        },
        {},
      );

      const response = await codexFetch(`${config.codexBaseUrl}/responses`, {
        method: 'POST',
        headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      extractCodexLimitsFromResponse(response.headers);
      // Abandon the generation — we only needed the headers.
      try {
        await response.body?.cancel();
      } catch {
        // Best-effort; nothing to do if the stream is already closed.
      }
    } catch (error) {
      logError(error as Error);
    }
    return getCodexLimits();
  }
}

class ChatGPTResponsesAdapter implements ProviderAdapter {
  readonly label = 'ChatGPT';
  readonly streamTimeoutMs = 60_000;

  constructor(private readonly client: ResponsesClient) {}

  async createMessage(params: BetaMessageStreamParams, options?: { signal?: AbortSignal }): Promise<BetaMessage> {
    const response = await this.client.responses.create(this.convertToResponses(params, false), options);
    return this.convertResponseToAnthropic(response, params.model);
  }

  async streamMessage(
    params: BetaMessageStreamParams,
    options?: { signal?: AbortSignal },
  ): Promise<AsyncGenerator<unknown, void, undefined>> {
    const stream = (await this.client.responses.create(
      this.convertToResponses(params, true),
      options,
    )) as AsyncGenerator<unknown, void, undefined>;
    return withStreamWatchdog(this.convertStreamToAnthropic(stream), this.streamTimeoutMs, this.label);
  }

  normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      const enriched = new Error(`[${this.label}] ${error.message}`) as any;
      if ((error as any)._providerError) enriched._providerError = (error as any)._providerError;
      if ((error as any).status) enriched.status = (error as any).status;
      return enriched;
    }
    return new Error(`[${this.label}] ${String(error)}`);
  }

  private convertToResponses(params: BetaMessageStreamParams, stream: boolean): Record<string, unknown> {
    return {
      model: params.model,
      input: convertMessagesToResponsesInput(params.messages),
      instructions: convertSystemPrompt(params.system),
      ...(params.tools?.length ? { tools: convertTools(params.tools) } : {}),
      ...(params.top_p !== undefined ? { top_p: params.top_p } : {}),
      stream,
    };
  }

  private convertResponseToAnthropic(response: unknown, fallbackModel: string): BetaMessage {
    const record = (response && typeof response === 'object' ? response : {}) as Record<string, any>;
    const content: any[] = [];

    for (const item of Array.isArray(record.output) ? record.output : []) {
      if (item?.type === 'message') {
        for (const part of Array.isArray(item.content) ? item.content : []) {
          const text =
            typeof part?.text === 'string' ? part.text : typeof part?.content === 'string' ? part.content : undefined;
          if (text) content.push({ type: 'text', text });
        }
      } else if (item?.type === 'function_call') {
        content.push({
          type: 'tool_use',
          id: item.call_id ?? item.id ?? `call_${content.length}`,
          name: item.name ?? 'tool',
          input: parseJsonObject(item.arguments),
        });
      } else if (typeof item?.text === 'string') {
        content.push({ type: 'text', text: item.text });
      }
    }

    const outputText = record.output_text;
    if (content.length === 0 && typeof outputText === 'string' && outputText.length > 0) {
      content.push({ type: 'text', text: outputText });
    }

    return {
      id: record.id ?? `msg-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: record.model ?? fallbackModel,
      content,
      stop_reason: mapResponsesStatus(record.status),
      stop_sequence: null,
      usage: {
        input_tokens: record.usage?.input_tokens ?? 0,
        output_tokens: record.usage?.output_tokens ?? 0,
      },
    } as any;
  }

  private async *convertStreamToAnthropic(
    stream: AsyncGenerator<unknown, void, undefined>,
  ): AsyncGenerator<unknown, void, undefined> {
    yield {
      type: 'message_start',
      message: {
        id: `msg-${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [],
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    };

    let activeIndex: number | null = null;
    let nextIndex = 0;
    let textIndex: number | null = null;
    const toolIndexes = new Map<string, number>();
    let sawContent = false;
    let usage: { input_tokens?: number; output_tokens?: number } | undefined;

    for await (const rawEvent of stream) {
      const event = (rawEvent && typeof rawEvent === 'object' ? rawEvent : {}) as Record<string, any>;
      const type = String(event.type ?? '');

      if (type === 'response.output_item.added' && event.item?.type === 'function_call') {
        if (activeIndex !== null) yield { type: 'content_block_stop', index: activeIndex };
        const index = nextIndex++;
        const callId = event.item.call_id ?? event.item.id ?? `call_${index}`;
        toolIndexes.set(callId, index);
        yield {
          type: 'content_block_start',
          index,
          content_block: { type: 'tool_use', id: callId, name: event.item.name ?? 'tool', input: '' },
        };
        activeIndex = index;
        sawContent = true;
        continue;
      }

      if (type.includes('function_call_arguments') && typeof event.delta === 'string') {
        const index = toolIndexes.get(event.item_id) ?? activeIndex ?? nextIndex++;
        yield { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: event.delta } };
        activeIndex = index;
        sawContent = true;
        continue;
      }

      if (type === 'response.output_item.done' && event.item?.type === 'function_call') {
        const index = toolIndexes.get(event.item.call_id ?? event.item.id);
        if (index !== undefined) {
          yield { type: 'content_block_stop', index };
          activeIndex = null;
        }
        continue;
      }

      const reasoningDelta = type.includes('reasoning') && typeof event.delta === 'string' ? event.delta : undefined;
      if (reasoningDelta) {
        if (activeIndex !== null) yield { type: 'content_block_stop', index: activeIndex };
        const index = nextIndex++;
        yield { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } };
        yield { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: reasoningDelta } };
        yield { type: 'content_block_stop', index };
        activeIndex = null;
        sawContent = true;
        continue;
      }

      const textDelta = type.endsWith('output_text.delta') && typeof event.delta === 'string' ? event.delta : undefined;
      if (textDelta !== undefined) {
        if (textIndex === null) {
          if (activeIndex !== null) yield { type: 'content_block_stop', index: activeIndex };
          textIndex = nextIndex++;
          yield { type: 'content_block_start', index: textIndex, content_block: { type: 'text', text: '' } };
          activeIndex = textIndex;
        }
        yield { type: 'content_block_delta', index: textIndex, delta: { type: 'text_delta', text: textDelta } };
        sawContent = true;
        continue;
      }

      if (type === 'response.completed' || type === 'response.incomplete') {
        usage = event.response?.usage;
        // Secondary usage source: some backend versions carry rate limits on
        // the completion event rather than the initial response headers.
        if (event.response?.rate_limits) {
          extractCodexLimitsFromResponse(undefined, event.response.rate_limits);
        }
      }
    }

    if (activeIndex !== null) yield { type: 'content_block_stop', index: activeIndex };
    if (!sawContent) {
      yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
      yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '' } };
      yield { type: 'content_block_stop', index: 0 };
    }
    yield {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { input_tokens: usage?.input_tokens ?? 0, output_tokens: usage?.output_tokens ?? 0 },
    };
    yield { type: 'message_stop' };
  }
}

function convertSystemPrompt(system: BetaMessageStreamParams['system']): string | undefined {
  if (!system) return undefined;
  if (typeof system === 'string') return system;
  return system.map((item: any) => (typeof item === 'string' ? item : (item.text ?? ''))).join('\n');
}

function convertMessagesToResponsesInput(messages: BetaMessageStreamParams['messages']): OpenAIResponseInputItem[] {
  const input: OpenAIResponseInputItem[] = [];
  for (const message of messages) {
    if (typeof message.content === 'string') {
      input.push({
        role: message.role,
        content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.content }],
      });
      continue;
    }

    const content: OpenAIResponseInputItem[] = [];
    for (const block of message.content) {
      if (block.type === 'text') {
        content.push({ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: block.text });
      } else if (block.type === 'image' && block.source?.type === 'base64') {
        content.push({ type: 'input_image', image_url: `data:${block.source.media_type};base64,${block.source.data}` });
      } else if ((block as any).type === 'image_url' && typeof (block as any).image_url?.url === 'string') {
        content.push({ type: 'input_image', image_url: (block as any).image_url.url });
      } else if (block.type === 'tool_use') {
        input.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        });
      } else if (block.type === 'tool_result') {
        input.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: stringifyToolResult(block.content),
        });
      }
    }
    if (content.length > 0) {
      input.push({ role: message.role, content });
    }
  }
  return input;
}

function convertTools(tools: NonNullable<BetaMessageStreamParams['tools']>): OpenAIResponseInputItem[] {
  return tools.map((tool: any) => ({
    type: 'function',
    name: tool.name,
    description: tool.description ?? '',
    parameters: tool.input_schema ?? { type: 'object', properties: {} },
  }));
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : JSON.stringify(part)))
      .join('\n');
  }
  return JSON.stringify(content);
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function mapResponsesStatus(status: unknown): string {
  return status === 'incomplete' ? 'max_tokens' : 'end_turn';
}

function normalizeReasoningEffort(value: string | undefined): ReasoningEffort | undefined {
  return value === 'none' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh'
    ? value
    : undefined;
}

function normalizeServiceTier(
  value: string | undefined,
): 'auto' | 'default' | 'flex' | 'priority' | 'fast' | undefined {
  return value === 'auto' || value === 'default' || value === 'flex' || value === 'priority' || value === 'fast'
    ? value
    : undefined;
}

registerAdapter(CHATGPT_PROVIDER_ID, (client: ResponsesClient) => new ChatGPTResponsesAdapter(client));
