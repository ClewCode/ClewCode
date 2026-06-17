/**
 * Provider adapter that wraps non-Anthropic SDK clients into an
 * Anthropic-compatible interface (`client.beta.messages.*`).
 *
 * This allows the existing `claude.ts` streaming loop (which speaks
 * Anthropic `BetaMessageStreamEvent`) to work with OpenAI-compatible,
 * Google Gemini, and other provider APIs via unified conversion.
 *
 * Each provider type should implement `ProviderAdapter` and register
 * in the adapter registry below.
 *
 * J8: Added stream watchdog per-provider, content_filter error handling,
 * and disconnect detection for non-Anthropic streaming paths.
 */
import { getProviderModelInfo, getProviderRegistryEntry } from '../providerRegistry.js';

/** Per-provider stream watchdog defaults (seconds). Override per adapter. */
const DEFAULT_STREAM_TIMEOUT_MS = 30_000;
/**
 * Map Anthropic structured output config (output_config.format) to OpenAI
 * response_format. Only applies when the params carry an output_config with
 * a json_schema format — OpenAI uses response_format for the same purpose.
 *
 * Returns empty object when no mapping is needed (no output config, or the
 * provider isn't an OpenAI-compatible API).
 */
function getOpenAIResponseFormat(params) {
  const outputConfig = params.output_config;
  if (outputConfig?.format?.type === 'json_schema' && outputConfig.format.json_schema) {
    return {
      response_format: {
        type: 'json_schema',
        json_schema: outputConfig.format.json_schema,
      },
    };
  }
  return {};
}
/**
 * Map Anthropic output_config.effort to OpenAI reasoning_effort.
 * Many OpenAI-compatible providers (DeepSeek, NVIDIA, etc.) support
 * reasoning_effort to control the model's thinking budget.
 *
 * Checks both provider-level capability and model-level reasoning
 * support before sending reasoning_effort. If the specific model is
 * not in the provider registry, defaults to NOT sending it to avoid
 * 400 errors on models that don't support it.
 */
function getOpenAIReasoningEffort(params, providerId) {
  const outputConfig = params.output_config;
  if (!outputConfig?.effort) return {};
  // Check provider-level capability first
  try {
    const entry = getProviderRegistryEntry(providerId);
    if (!entry.capabilities.reasoningEffort) return {};
    // Check model-level reasoning support
    const modelInfo = getProviderModelInfo(providerId, params.model);
    if (modelInfo && !modelInfo.capabilities.reasoning) return {};
    // If model is not in registry, be conservative — skip reasoning_effort
    // since we can't confirm the model supports it.
    if (!modelInfo) return {};
  } catch {
    return {};
  }
  return { reasoning_effort: outputConfig.effort };
}
/** Helper: race a stream generator against a timeout watchdog. */
export async function* withStreamWatchdog(stream, timeoutMs, label) {
  if (timeoutMs <= 0) {
    yield* stream;
    return;
  }
  let lastChunkTime = Date.now();
  let watchdog;
  const resetWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    lastChunkTime = Date.now();
  };
  const startWatchdog = () =>
    new Promise((_, reject) => {
      const check = () => {
        const elapsed = Date.now() - lastChunkTime;
        if (elapsed >= timeoutMs) {
          reject(new Error(`[${label}] Stream stalled — no chunk received for ${Math.round(elapsed / 1000)}s`));
          return;
        }
        // Re-check after the remaining time
        watchdog = setTimeout(check, Math.min(timeoutMs - elapsed, 5_000));
        if (typeof watchdog === 'object' && 'unref' in watchdog) {
          watchdog.unref?.();
        }
      };
      watchdog = setTimeout(check, timeoutMs);
      if (typeof watchdog === 'object' && 'unref' in watchdog) {
        watchdog.unref?.();
      }
    });
  const iterator = stream[Symbol.asyncIterator]();
  let done = false;
  while (!done) {
    resetWatchdog();
    const raceResult = await Promise.race([
      iterator.next().then(r => ({ type: 'next', value: r })),
      startWatchdog().catch(e => ({ type: 'error', error: e })),
    ]);
    if (watchdog) clearTimeout(watchdog);
    if (raceResult.type === 'error') {
      // Best-effort: try to return the iterator so upstream cleanup can run.
      try {
        await iterator.return?.();
      } catch {
        /* swallow */
      }
      throw raceResult.error;
    }
    const next = raceResult.value;
    if (next.done) {
      done = true;
      break;
    }
    yield next.value;
  }
  if (watchdog) clearTimeout(watchdog);
}
// ── Adapter registry ─────────────────────────────────────────────────────────
const adapterRegistry = new Map();
/**
 * Register a factory for a given provider id.
 * Called at module init time by each provider's own file.
 */
export function registerAdapter(providerId, factory) {
  adapterRegistry.set(providerId, factory);
}
/**
 * Look up the registered adapter for `providerId`. Returns `undefined` when
 * no specialised adapter exists (the caller should fall back to the generic
 * OpenAI-compatible adapter).
 */
export function getAdapter(providerId) {
  return adapterRegistry.get(providerId);
}
// ── Generic OpenAI-compatible adapter (the default) ──────────────────────────
export function normalizeOpenAIToolInputSchema(inputSchema) {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return { type: 'object', properties: {}, additionalProperties: true };
  }
  const schema = { ...inputSchema };
  // zod's z.union / z.discriminatedUnion produce root shapes (e.g.
  // FileReadTool, PRTool) where `type` may be missing — ensure it's
  // always "object" at the root for provider compatibility.
  // (Moonshot-specific strip handled in convertToOpenAI.)
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    schema.type = 'object';
    return schema;
  }
  if (schema.type !== 'object') {
    schema.type = 'object';
  }
  return schema;
}
function stringifyReasoningContent(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const text = item.text;
          if (typeof text === 'string') return text;
        }
        return '';
      })
      .join('');
  }
  return '';
}
class OpenAICompatibleAdapter {
  label;
  client;
  providerId;
  /** OpenAI/OpenRouter rate-limit constantly — shorter watchdog avoids noise. */
  streamTimeoutMs = 45_000;
  constructor(client, providerId, label = 'OpenAI-Compatible') {
    this.client = client;
    this.providerId = providerId;
    this.label = label;
  }
  /**
   * Check whether the target model supports image inputs (base64/URL).
   * First checks model-level `imageIn`, falls back to provider-level `imageIn`,
   * then to the legacy `vision` flag.
   */
  modelSupportsVision(modelId) {
    try {
      const entry = getProviderRegistryEntry(this.providerId);
      // Check model-level imageIn first
      const modelInfo = getProviderModelInfo(this.providerId, modelId);
      if (modelInfo?.capabilities.imageIn !== undefined) return modelInfo.capabilities.imageIn;
      if (modelInfo) return modelInfo.capabilities.vision;
      // Fall back to provider-level imageIn, then legacy vision
      if (entry.capabilities.imageIn !== undefined) return entry.capabilities.imageIn;
      return entry.capabilities.vision;
    } catch {
      // If registry lookup fails, assume yes — let the provider reject if needed
      return true;
    }
  }
  /**
   * Check whether the target model supports video inputs (base64/URL).
   * Model-level check first, then provider-level.
   * @since 0.2.8
   */
  modelSupportsVideo(modelId) {
    try {
      const entry = getProviderRegistryEntry(this.providerId);
      const modelInfo = getProviderModelInfo(this.providerId, modelId);
      if (modelInfo?.capabilities.videoIn !== undefined) return modelInfo.capabilities.videoIn;
      if (entry.capabilities.videoIn !== undefined) return entry.capabilities.videoIn;
      return false; // No provider declares video support by default
    } catch {
      return false;
    }
  }
  async createMessage(params, options) {
    const openAIParams = this.convertToOpenAI(params);
    const response = await this.client.chat.completions.create(
      { ...openAIParams, stream: false },
      { signal: options?.signal },
    );
    return this.convertToAnthropic(response);
  }
  async *streamMessage(params, options) {
    const openAIParams = this.convertToOpenAI(params);
    const stream = await this.client.chat.completions.create(
      { ...openAIParams, stream: true, stream_options: { include_usage: true } },
      { signal: options?.signal },
    );
    yield* withStreamWatchdog(this.wrapStream(stream), this.streamTimeoutMs, this.label);
  }
  normalizeError(error) {
    // Extract structured error info from OpenAI/OpenRouter error shapes
    if (error && typeof error === 'object') {
      const e = error;
      const status = e.status ?? e.statusCode;
      const code = e.code ?? e.type;
      const message = e.message ?? String(error);
      // Rate limit
      if (status === 429 || code === 'rate_limit_exceeded' || code === 'insufficient_quota') {
        const retryAfter = e.headers?.['retry-after'] ?? e.retryAfter;
        const err = new Error(`[${this.label}] Rate limited: ${message}`);
        err._providerError = { category: 'rate_limit', retryAfter, status };
        return err;
      }
      // Content filtered / safety
      if (status === 400 && (code === 'content_filter' || code === 'content_policy_violation')) {
        const err = new Error(`[${this.label}] Content blocked by safety filter`);
        err._providerError = { category: 'content_filter', status };
        return err;
      }
      // Image not supported — catch provider errors about image_url or vision
      if (
        status === 400 &&
        (message.includes('unknown variant `image_url`') ||
          message.includes('does not support image input') ||
          message.includes('No endpoints found that support image') ||
          (message.includes('image_url') && message.includes('not supported')))
      ) {
        const err = new Error(
          `[${this.label}] Image input is not supported by this model. Remove images or switch to a vision-capable model.`,
        );
        err._providerError = { category: 'invalid_request', status };
        return err;
      }
      // Auth
      if (status === 401 || status === 403) {
        const err = new Error(`[${this.label}] Authentication failed: ${message}`);
        err._providerError = { category: 'auth', status };
        return err;
      }
      // Server error
      if (status >= 500) {
        const err = new Error(`[${this.label}] Server error ${status}: ${message}`);
        err._providerError = { category: 'server_error', status };
        return err;
      }
    }
    if (error instanceof Error) {
      // If the error already has _providerError (from a nested call), keep it
      const enriched = new Error(`[${this.label}] ${error.message}`);
      if (error._providerError) enriched._providerError = error._providerError;
      return enriched;
    }
    const message = typeof error === 'object' && error !== null ? String(error.message ?? error) : String(error);
    return new Error(`[${this.label}] ${message}`);
  }
  /**
   * Convert Anthropic-format params to an OpenAI chat.completions.create payload.
   */
  convertToOpenAI(params) {
    const messages = [];
    for (const m of params.messages) {
      const openAIMessage = { role: m.role, content: '' };
      if (typeof m.content === 'string') {
        openAIMessage.content = m.content;
      } else if (Array.isArray(m.content)) {
        const textParts = [];
        const imageParts = [];
        const toolCalls = [];
        const reasoningParts = [];
        for (const c of m.content) {
          if (c.type === 'text') {
            textParts.push(c.text);
          } else if (c.type === 'image') {
            // Skip image if model doesn't support vision
            if (!this.modelSupportsVision(params.model)) {
              textParts.push(`[Image not sent — ${params.model} does not support vision]`);
              continue;
            }
            // Convert Anthropic image block to OpenAI image content part
            const source = c.source;
            if (source?.type === 'base64') {
              imageParts.push({
                type: 'image_url',
                image_url: {
                  url: `data:${source.media_type};base64,${source.data}`,
                },
              });
            }
          } else if (c.type === 'video') {
            // Skip video if model doesn't support it
            if (!this.modelSupportsVideo(params.model)) {
              textParts.push(`[Video not sent — ${params.model} does not support video input]`);
              continue;
            }
            // Convert Anthropic video block to OpenAI image content part
            // (OpenAI treats video as a sequence of image frames or a single thumbnail)
            const source = c.source;
            if (source?.type === 'base64') {
              imageParts.push({
                type: 'image_url',
                image_url: {
                  url: `data:${source.media_type};base64,${source.data}`,
                },
              });
            }
          } else if (c.type === 'thinking') {
            reasoningParts.push(c.thinking);
          } else if (c.type === 'tool_use') {
            toolCalls.push({
              id: c.id,
              type: 'function',
              function: {
                name: c.name,
                arguments: JSON.stringify(c.input),
              },
            });
          } else if (c.type === 'tool_result') {
            // Tool results become a separate tool message in OpenAI format.
            messages.push({
              role: 'tool',
              tool_call_id: c.tool_use_id,
              content:
                typeof c.content === 'string'
                  ? c.content
                  : Array.isArray(c.content)
                    ? c.content
                        .map(b => (b.type === 'text' ? b.text : ''))
                        .filter(Boolean)
                        .join('\n')
                    : JSON.stringify(c.content),
            });
          }
        }
        // Build content array — prefer image parts when present, fall back to text
        if (imageParts.length > 0) {
          // Combine text + images as a multimodal content array
          openAIMessage.content = [
            ...(textParts.length > 0 ? [{ type: 'text', text: textParts.join('\n') }] : []),
            ...imageParts,
          ];
        } else if (textParts.length > 0) {
          openAIMessage.content = textParts.join('\n');
        } else if (toolCalls.length > 0) {
          openAIMessage.content = null;
        }
        if (toolCalls.length > 0) {
          openAIMessage.tool_calls = toolCalls;
        }
        // Prefer raw reasoning_content preserved from prior API responses
        // (some providers like Xiaomi require it passed back unchanged)
        const rawReasoning = m.reasoning_content;
        if (typeof rawReasoning === 'string' && rawReasoning.length > 0) {
          openAIMessage.reasoning_content = rawReasoning;
        } else if (reasoningParts.length > 0) {
          openAIMessage.reasoning_content = reasoningParts.join('');
        }
      }
      // Only push assistant/user messages with meaningful payload.
      if (
        openAIMessage.content !== '' &&
        openAIMessage.content !== null &&
        !(Array.isArray(openAIMessage.content) && openAIMessage.content.length === 0)
      ) {
        messages.push(openAIMessage);
      } else if (openAIMessage.tool_calls || openAIMessage.reasoning_content) {
        messages.push(openAIMessage);
      }
    }
    // System prompt → first system message
    if (params.system) {
      const systemContent = Array.isArray(params.system)
        ? params.system.map(s => (typeof s === 'string' ? s : (s.text ?? ''))).join('\n')
        : params.system;
      messages.unshift({ role: 'system', content: systemContent });
    }
    // Map tools
    const tools = params.tools?.length
      ? params.tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description ?? '',
            parameters: normalizeOpenAIToolInputSchema(t.input_schema),
          },
        }))
      : undefined;
    // Moonshot/Kimi strictly rejects { type: "object", anyOf/oneOf: [...] }
    // — type must live in the branches, not the parent. Strip root type
    // from union schemas here (adapter-specific, not in the shared normalize).
    if (this.providerId === 'moonshot' && tools) {
      for (const tool of tools) {
        const p = tool.function.parameters;
        if ((Array.isArray(p.anyOf) || Array.isArray(p.oneOf)) && p.type === 'object') {
          delete p.type;
        }
      }
    }
    return {
      model: params.model,
      messages,
      max_tokens: params.max_tokens,
      temperature: params.temperature ?? 1,
      top_p: params.top_p,
      stop: params.stop_sequences,
      ...(tools ? { tools } : {}),
      ...getOpenAIResponseFormat(params),
      ...getOpenAIReasoningEffort(params, this.providerId),
    };
  }
  /**
   * Convert an OpenAI chat completion response back to Anthropic BetaMessage.
   */
  convertToAnthropic(openAIResponse) {
    const choice = openAIResponse.choices?.[0];
    const message = choice?.message ?? {};
    const content = [];
    const reasoningContent = stringifyReasoningContent(message.reasoning_content ?? message.reasoning);
    if (reasoningContent) {
      content.push({ type: 'thinking', thinking: reasoningContent, signature: '' });
    }
    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: (() => {
            try {
              return JSON.parse(tc.function.arguments);
            } catch {
              return tc.function.arguments;
            }
          })(),
        });
      }
    }
    return {
      id: openAIResponse.id ?? `msg-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: openAIResponse.model ?? 'unknown',
      content,
      stop_reason: this.mapFinishReason(choice?.finish_reason),
      stop_sequence: null,
      usage: {
        input_tokens: openAIResponse.usage?.prompt_tokens ?? 0,
        output_tokens: openAIResponse.usage?.completion_tokens ?? 0,
        ...(() => {
          const cached = openAIResponse.usage?.prompt_tokens_details?.cached_tokens;
          return typeof cached === 'number' && cached > 0 ? { cache_read_input_tokens: cached } : {};
        })(),
      },
    };
  }
  /**
   * Convert an OpenAI streaming response into Anthropic-compatible
   * stream events (content_block_start, content_block_delta, …).
   *
   * J8: Detects content_filter finish_reason mid-stream and throws
   * a structured error so the caller can surface it to the user instead
   * of silently truncating the response.
   */
  async *wrapStream(stream) {
    // message_start
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
    let activeIndex = null;
    const sentMessageDelta = false;
    let hasStartedThinkingBlock = false;
    let streamUsage = null;
    try {
      for await (const chunk of stream) {
        // Check finish_reason on every chunk — content_filter can arrive mid-stream
        const finishReason = chunk.choices?.[0]?.finish_reason;
        if (finishReason === 'content_filter') {
          // Emit a content_block_stop for the active block so the downstream
          // message builder sees a clean boundary, then throw to surface the
          // content filter to error handling.
          if (activeIndex !== null) {
            yield { type: 'content_block_stop', index: activeIndex };
          }
          const err = new Error(`[${this.label}] Content filtered by provider's safety system`);
          err._providerError = { category: 'content_filter', status: 400 };
          throw err;
        }
        // Tool calls arrived as full array (non-streaming tool mode) — emit start/delta/stop
        if (finishReason === 'tool_calls' && !chunk.choices?.[0]?.delta?.tool_calls) {
          // Handled below via usage / message_delta
        }
        // Capture usage from the final streaming chunk (emitted by
        // stream_options: { include_usage: true })
        if (chunk.usage) {
          streamUsage = chunk.usage;
        }
        if (!chunk.choices?.[0]?.delta) continue;
        const delta = chunk.choices[0].delta;
        // Reasoning / thinking content
        const reasoningContent = stringifyReasoningContent(delta.reasoning_content ?? delta.reasoning);
        if (reasoningContent) {
          if (activeIndex !== 0 || !hasStartedThinkingBlock) {
            if (activeIndex !== null) yield { type: 'content_block_stop', index: activeIndex };
            yield {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'thinking', thinking: '', signature: '' },
            };
            activeIndex = 0;
            hasStartedThinkingBlock = true;
          }
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: reasoningContent },
          };
          continue;
        }
        // Text content
        if (delta.content) {
          const textIndex = hasStartedThinkingBlock ? 1 : 0;
          if (activeIndex !== textIndex) {
            if (activeIndex !== null) yield { type: 'content_block_stop', index: activeIndex };
            yield {
              type: 'content_block_start',
              index: textIndex,
              content_block: { type: 'text', text: '' },
            };
            activeIndex = textIndex;
          }
          yield {
            type: 'content_block_delta',
            index: textIndex,
            delta: { type: 'text_delta', text: delta.content },
          };
          continue;
        }
        // Tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = (tc.index ?? 0) + (hasStartedThinkingBlock ? 2 : 1);
            if (tc.function?.name) {
              if (activeIndex !== null && activeIndex !== index) {
                yield { type: 'content_block_stop', index: activeIndex };
              }
              yield {
                type: 'content_block_start',
                index,
                content_block: {
                  type: 'tool_use',
                  id: tc.id ?? `call_${index}`,
                  name: tc.function.name,
                  input: '',
                },
              };
              activeIndex = index;
            }
            if (tc.function?.arguments) {
              yield {
                type: 'content_block_delta',
                index,
                delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
              };
            }
          }
        }
      }
    } catch (err) {
      // If this is already a structured provider error (e.g. content_filter),
      // re-throw so it reaches the error handler. Otherwise, wrap for clarity.
      if (err?._providerError) throw err;
      // Abrupt disconnect / network error during streaming
      const wrapped = new Error(
        `[${this.label}] Stream interrupted: ${err instanceof Error ? err.message : String(err)}`,
      );
      wrapped._providerError = { category: 'network', status: undefined };
      throw wrapped;
    }
    // Close last block
    if (activeIndex !== null) yield { type: 'content_block_stop', index: activeIndex };
    // Detect empty streams: some providers (e.g. minimax-m3) return a clean
    // stream with no content blocks (0 tokens, no finish_reason issue).
    // Surface as a structured error instead of letting an empty assistant
    // message render as a bare ▶.
    if (activeIndex === null && !hasStartedThinkingBlock) {
      const err = new Error(`[${this.label}] Model returned an empty response (no content blocks emitted)`);
      err._providerError = { category: 'empty_response', status: 200 };
      throw err;
    }
    if (!sentMessageDelta) {
      // Map OpenAI cached_tokens to Anthropic cache format
      const cachedTokens = streamUsage?.prompt_tokens_details?.cached_tokens;
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {
          input_tokens: streamUsage?.prompt_tokens ?? 0,
          output_tokens: streamUsage?.completion_tokens ?? 0,
          ...(typeof cachedTokens === 'number' && cachedTokens > 0 ? { cache_read_input_tokens: cachedTokens } : {}),
        },
      };
    }
    yield { type: 'message_stop' };
  }
  mapFinishReason(reason) {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'tool_calls':
        return 'tool_use';
      case 'length':
        return 'max_tokens';
      case 'content_filter':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }
}
// ── Default adapter registration ─────────────────────────────────────────────
// Register the generic OpenAI-compatible adapter so every provider gets a
// sensible default unless they register their own specialised adapter.
registerAdapter('__default__', (client, providerId) => new OpenAICompatibleAdapter(client, providerId));
// ── AnthropicAdapter (legacy wrapper) ─────────────────────────────────────────
/**
 * Wraps a provider SDK client so it exposes `client.beta.messages.*`
 * (Anthropic-compatible shape). Used by `client.ts::getAIProviderClient()`.
 *
 * Uses the adapter registry to find the right adapter for the provider,
 * falling back to the generic OpenAI-compatible adapter.
 */
export class AnthropicAdapter {
  client;
  providerId;
  adapter;
  constructor(client, providerId) {
    this.client = client;
    this.providerId = providerId;
    const factory = getAdapter(providerId) ?? getAdapter('__default__');
    this.adapter = factory(client, this.providerId);
  }
  get beta() {
    return { messages: this.messages };
  }
  get messages() {
    return {
      create: (params, options) => {
        if (params.stream) return this.handleStreaming(params, options);
        return this.handleNonStreaming(params, options);
      },
    };
  }
  handleNonStreaming(params, options) {
    const promise = this.adapter.createMessage(params, options).catch(err => {
      throw this.adapter.normalizeError(err);
    });
    return Object.assign(promise, {
      withResponse: async () => {
        const data = await promise;
        return {
          data,
          response: { headers: new Headers() },
          request_id: `adapter-${Date.now()}`,
        };
      },
    });
  }
  handleStreaming(params, options) {
    return {
      withResponse: async () => {
        const rawStream = this.adapter.streamMessage(params, options);
        // Wrap with stream watchdog (J8) — auto-fail stalled streams.
        const timeoutMs = this.adapter.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
        const stream = timeoutMs > 0 ? withStreamWatchdog(rawStream, timeoutMs, this.adapter.label) : rawStream;
        return {
          data: stream,
          response: { headers: new Headers() },
          request_id: `adapter-${Date.now()}`,
        };
      },
    };
  }
}
