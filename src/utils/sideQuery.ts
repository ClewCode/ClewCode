import type Anthropic from '@anthropic-ai/sdk';
import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages.js';
import { getLastApiCompletionTimestamp, setLastApiCompletionTimestamp } from '../bootstrap/state.js';
import { STRUCTURED_OUTPUTS_BETA_HEADER } from '../constants/betas.js';
import type { QuerySource } from '../constants/querySource.js';
import { getAttributionHeader, getCLISyspromptPrefix } from '../constants/system.js';
import { addToTotalSessionCost } from '../cost-tracker.js';
import { ProviderManager } from '../services/ai/ProviderManager.js';
import { PROVIDER_REGISTRY } from '../services/ai/providerRegistry.js';
import { fromGenericUsage } from '../services/ai/usageTypes.js';
import { logEvent } from '../services/analytics/index.js';
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../services/analytics/metadata.js';
import { getAPIMetadata } from '../services/api/claude.js';
import { getAnthropicClient } from '../services/api/client.js';
import { classifyProviderError } from '../services/api/errors.js';
import { getModelBetas, modelSupportsStructuredOutputs } from './betas.js';
import { computeFingerprint } from './fingerprint.js';
import { logError } from './log.js';
import { normalizeModelStringForAPI } from './model/model.js';
import { getActiveProviderId, isAnthropicProvider } from './model/providers.js';
import { calculateUSDCostFromProviderUsage } from './modelCost.js';

type MessageParam = Anthropic.MessageParam;
type TextBlockParam = Anthropic.TextBlockParam;
type Tool = Anthropic.Tool;
type ToolChoice = Anthropic.ToolChoice;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaJSONOutputFormat = Anthropic.Beta.Messages.BetaJSONOutputFormat;
type BetaThinkingConfigParam = Anthropic.Beta.Messages.BetaThinkingConfigParam;

export type SideQueryOptions = {
  /** Model to use for the query */
  model: string;
  /**
   * System prompt - string or array of text blocks (will be prefixed with CLI attribution).
   *
   * The attribution header is always placed in its own TextBlockParam block to ensure
   * server-side parsing correctly extracts the cc_entrypoint value without including
   * system prompt content.
   */
  system?: string | TextBlockParam[];
  /** Messages to send (supports cache_control on content blocks) */
  messages: MessageParam[];
  /** Optional tools (supports both standard Tool[] and BetaToolUnion[] for custom tool types) */
  tools?: Tool[] | BetaToolUnion[];
  /** Optional tool choice (use { type: 'tool', name: 'x' } for forced output) */
  tool_choice?: ToolChoice;
  /** Optional JSON output format for structured responses */
  output_format?: BetaJSONOutputFormat;
  /** Max tokens (default: 1024) */
  max_tokens?: number;
  /** Max retries (default: 2) */
  maxRetries?: number;
  /** Abort signal */
  signal?: AbortSignal;
  /** Skip CLI system prompt prefix (keeps attribution header for OAuth). For internal classifiers that provide their own prompt. */
  skipSystemPromptPrefix?: boolean;
  /** Temperature override */
  temperature?: number;
  /** Thinking budget (enables thinking), or `false` to send `{ type: 'disabled' }`. */
  thinking?: number | false;
  /** Stop sequences — generation stops when any of these strings is emitted */
  stop_sequences?: string[];
  /** Attributes this call in tengu_api_success for COGS joining against reporting.sampling_calls. */
  querySource: QuerySource;
};

/**
 * Extract text from first user message for fingerprint computation.
 */
function extractFirstUserMessageText(messages: MessageParam[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return '';

  const content = firstUserMessage.content;
  if (typeof content === 'string') return content;

  // Array of content blocks - find first text block
  const textBlock = content.find(block => block.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text : '';
}

/**
 * Lightweight API wrapper for "side queries" outside the main conversation loop.
 *
 * Use this instead of direct client.beta.messages.create() calls to ensure
 * proper OAuth token validation with fingerprint attribution headers.
 *
 * This handles:
 * - Fingerprint computation for OAuth validation
 * - Attribution header injection
 * - CLI system prompt prefix
 * - Proper betas for the model
 * - API metadata
 * - Model string normalization (strips [1m] suffix for API)
 *
 * @example
 * // Permission explainer
 * await sideQuery({ querySource: 'permission_explainer', model, system: SYSTEM_PROMPT, messages, tools, tool_choice })
 *
 * @example
 * // Session search
 * await sideQuery({ querySource: 'session_search', model, system: SEARCH_PROMPT, messages })
 *
 * @example
 * // Model validation
 * await sideQuery({ querySource: 'model_validation', model, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] })
 */
export async function sideQuery(opts: SideQueryOptions): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    output_format,
    max_tokens = 1024,
    maxRetries = 2,
    signal,
    skipSystemPromptPrefix,
    temperature,
    thinking,
    stop_sequences,
  } = opts;

  // ── Multi-provider routing ──────────────────────────────────────────────
  // Non-Anthropic path: skip OAuth fingerprint/attribution headers (Anthropic-
  // specific), use provider's chat API, and track costs via ProviderUsage.
  const anthropic = isAnthropicProvider();
  let normalizedModel = normalizeModelStringForAPI(model);

  // When using a non-Anthropic provider, resolve Claude model names to the
  // provider's default model (e.g. "claude-sonnet-4-7" → "deepseek-v4-pro").
  if (!anthropic && normalizedModel.startsWith('claude-')) {
    const providerId = getActiveProviderId();
    const registryEntry = PROVIDER_REGISTRY[providerId];
    if (registryEntry?.defaultModel) {
      normalizedModel = registryEntry.defaultModel;
    }
  }

  const start = Date.now();

  if (!anthropic) {
    const providerId = getActiveProviderId();
    const systemText = systemBlocksText(system, skipSystemPromptPrefix);

    try {
      const providerClient = (await ProviderManager.getInstance().createClient(providerId, {
        model: normalizedModel,
        maxRetries,
        source: 'side_query',
      })) as any;
      const messagesForProvider = [
        ...(systemText ? [{ role: 'system' as const, content: systemText }] : []),
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : m.content.map((c: any) => c.text || '').join(''),
        })),
      ];
      // Convert Anthropic tool format to OpenAI format
      const openaiTools =
        tools && tools.length > 0
          ? tools.map(t => {
              const tool = t as any;
              return {
                type: 'function' as const,
                function: {
                  name: tool.name,
                  description: tool.description ?? '',
                  parameters: tool.input_schema ?? tool.inputSchema ?? {},
                },
              };
            })
          : undefined;

      // Convert Anthropic tool_choice to OpenAI format
      let openaiToolChoice: any;
      if (tool_choice && openaiTools) {
        if (tool_choice.type === 'tool' && 'name' in tool_choice) {
          openaiToolChoice = { type: 'function', function: { name: tool_choice.name } };
        } else if (tool_choice.type === 'auto') {
          openaiToolChoice = 'auto';
        } else if (tool_choice.type === 'any') {
          openaiToolChoice = 'required';
        } else if (tool_choice.type === 'none') {
          openaiToolChoice = 'none';
        }
      }

      const result = await (providerClient.chat?.completions?.create ?? providerClient.beta?.messages?.create)({
        model: normalizedModel,
        max_tokens: max_tokens,
        messages: messagesForProvider,
        ...(temperature !== undefined && { temperature }),
        ...(stop_sequences && { stop: stop_sequences }),
        ...(openaiTools && { tools: openaiTools }),
        ...(openaiToolChoice !== undefined && { tool_choice: openaiToolChoice }),
      });

      const choice = result.choices?.[0] ?? result.content?.[0] ?? {};
      const msg = choice.message ?? choice;

      // Build content blocks: tool_calls from OpenAI → tool_use blocks
      const contentBlocks: any[] = [];
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          let parsedInput: any;
          try {
            parsedInput = JSON.parse(tc.function?.arguments ?? '{}');
          } catch {
            parsedInput = {};
          }
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id ?? `toolu_${Date.now()}`,
            name: tc.function?.name ?? 'unknown',
            input: parsedInput,
          });
        }
      }
      if (msg.content) {
        contentBlocks.push({ type: 'text', text: msg.content });
      }
      // Fallback: if no tool_calls and no content, wrap the whole choice
      if (contentBlocks.length === 0) {
        contentBlocks.push({ type: 'text', text: JSON.stringify(choice) });
      }

      const response: BetaMessage = {
        id: result.id ?? 'side-query',
        type: 'message' as any,
        model: normalizedModel,
        content: contentBlocks,
        usage: {
          input_tokens: result.usage?.prompt_tokens ?? result.usage?.input_tokens ?? 0,
          output_tokens: result.usage?.completion_tokens ?? result.usage?.output_tokens ?? 0,
        },
        stop_reason: msg.tool_calls?.length
          ? ('tool_use' as any)
          : msg.finish_reason === 'stop'
            ? ('end_turn' as any)
            : (msg.finish_reason as any),
      } as unknown as BetaMessage;

      // J2: Track side query costs for non-Anthropic providers
      try {
        const providerUsage = fromGenericUsage(response.usage as unknown as Record<string, unknown>);
        const costUSD = calculateUSDCostFromProviderUsage(normalizedModel, providerUsage);
        addToTotalSessionCost(costUSD, providerUsage, normalizedModel, providerId);
      } catch {
        /* cost tracking is best-effort */
      }

      // J1: Log with providerId for multi-provider debugging
      const now = Date.now();
      logEvent('tengu_api_success', {
        querySource: opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        model: normalizedModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        providerId: providerId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMsIncludingRetries: now - start,
        timeSinceLastApiCallMs:
          getLastApiCompletionTimestamp() !== null ? now - getLastApiCompletionTimestamp()! : undefined,
      });
      setLastApiCompletionTimestamp(now);
      return response;
    } catch (error) {
      // J5: Classify error with provider info for better debugging
      const classified = classifyProviderError(error);
      logError(
        new Error(
          `SideQuery [${providerId}/${normalizedModel}] ${classified.category}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      throw error;
    }
  }

  // ── Anthropic path (unchanged logic, extracted for clarity) ────────────
  const client = await getAnthropicClient({
    maxRetries,
    model,
    source: 'side_query',
  });
  const betas = [...getModelBetas(model)];
  if (output_format && modelSupportsStructuredOutputs(model) && !betas.includes(STRUCTURED_OUTPUTS_BETA_HEADER)) {
    betas.push(STRUCTURED_OUTPUTS_BETA_HEADER);
  }

  const messageText = extractFirstUserMessageText(messages);
  const fingerprint = computeFingerprint(messageText, MACRO.VERSION);
  const attributionHeader = getAttributionHeader(fingerprint);

  const systemBlocks: TextBlockParam[] = [
    attributionHeader ? { type: 'text', text: attributionHeader } : null,
    ...(skipSystemPromptPrefix
      ? []
      : [
          {
            type: 'text' as const,
            text: getCLISyspromptPrefix({ isNonInteractive: false, hasAppendSystemPrompt: false }),
          },
        ]),
    ...(Array.isArray(system) ? system : system ? [{ type: 'text' as const, text: system }] : []),
  ].filter((block): block is TextBlockParam => block !== null);

  let thinkingConfig: BetaThinkingConfigParam | undefined;
  if (thinking === false) {
    thinkingConfig = { type: 'disabled' };
  } else if (thinking !== undefined) {
    thinkingConfig = { type: 'enabled', budget_tokens: Math.min(thinking, max_tokens - 1) };
  }

  const response = await client.beta.messages.create(
    {
      model: normalizedModel,
      max_tokens,
      system: systemBlocks,
      messages,
      ...(tools && { tools }),
      ...(tool_choice && { tool_choice }),
      ...(output_format && { output_config: { format: output_format } }),
      ...(temperature !== undefined && { temperature }),
      ...(stop_sequences && { stop_sequences }),
      ...(thinkingConfig && { thinking: thinkingConfig }),
      ...(betas.length > 0 && { betas }),
      metadata: getAPIMetadata(),
    },
    { signal },
  );

  const requestId = (response as { _request_id?: string | null })._request_id ?? undefined;
  const now = Date.now();
  const lastCompletion = getLastApiCompletionTimestamp();
  logEvent('tengu_api_success', {
    requestId: requestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource: opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model: normalizedModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
    uncachedInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs: lastCompletion !== null ? now - lastCompletion : undefined,
  });
  setLastApiCompletionTimestamp(now);

  return response;
}

/** Build system text from blocks for non-Anthropic providers. */
function systemBlocksText(system: string | TextBlockParam[] | undefined, skipPrefix: boolean | undefined): string {
  const parts: string[] = [];
  if (!skipPrefix) {
    parts.push(getCLISyspromptPrefix({ isNonInteractive: false, hasAppendSystemPrompt: false }));
  }
  if (typeof system === 'string') {
    parts.push(system);
  } else if (Array.isArray(system)) {
    for (const block of system) {
      if (block.type === 'text') parts.push(block.text);
    }
  }
  return parts.join('\n');
}
