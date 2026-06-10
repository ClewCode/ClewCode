import type {
  BetaContentBlock,
  BetaWebSearchTool20250305,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import { getAPIProvider, isAnthropicProvider } from 'src/utils/model/providers.js';
import type { PermissionResult } from 'src/utils/permissions/PermissionResult.js';
import { z } from 'zod/v4';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js';
import { queryModelWithStreaming } from '../../services/api/claude.js';
import { isProviderConfigured, searchWithProvider } from '../../services/search/index.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { logError } from '../../utils/log.js';
import { createUserMessage } from '../../utils/messages.js';
import { getMainLoopModel, getSmallFastModel } from '../../utils/model/model.js';
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js';
import { asSystemPrompt } from '../../utils/systemPromptType.js';
import { getWebSearchPrompt, WEB_SEARCH_TOOL_NAME } from './prompt.js';
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js';

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(2).describe('The search query to use'),
    allowed_domains: z.array(z.string()).optional().describe('Only include search results from these domains'),
    blocked_domains: z.array(z.string()).optional().describe('Never include search results from these domains'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;

type Input = z.infer<InputSchema>;

const searchResultSchema = lazySchema(() => {
  const searchHitSchema = z.object({
    title: z.string().describe('The title of the search result'),
    url: z.string().describe('The URL of the search result'),
  });

  return z.object({
    tool_use_id: z.string().describe('ID of the tool use'),
    content: z.array(searchHitSchema).describe('Array of search hits'),
  });
});

export type SearchResult = z.infer<ReturnType<typeof searchResultSchema>>;

const outputSchema = lazySchema(() =>
  z.object({
    query: z.string().describe('The search query that was executed'),
    results: z
      .array(z.union([searchResultSchema(), z.string()]))
      .describe('Search results and/or text commentary from the model'),
    durationSeconds: z.number().describe('Time taken to complete the search operation'),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;

export type Output = z.infer<OutputSchema>;

// Re-export WebSearchProgress from centralized types to break import cycles
export type { WebSearchProgress } from '../../types/tools.js';

import type { WebSearchProgress } from '../../types/tools.js';

/**
 * Select the best available direct search provider.
 * Priority: tavily > brave > serper > searxng (if self-hosted) > duckduckgo
 *
 * SearXNG is only auto-selected when SEARXNG_INSTANCE_URL is explicitly set,
 * indicating the user has a self-hosted/working instance. Public instances
 * (the default) nearly all return 403/429 due to Cloudflare/anti-bot protection.
 */
function selectBestDirectProvider(): string {
  if (isProviderConfigured('tavily')) return 'tavily';
  if (isProviderConfigured('brave')) return 'brave';
  if (isProviderConfigured('serper')) return 'serper';
  // Only auto-select SearXNG if user has explicitly configured their own instance
  if (isProviderConfigured('searxng') && process.env.SEARXNG_INSTANCE_URL) return 'searxng';
  return 'duckduckgo';
}

/**
 * Check whether the Anthropic server-side web_search returned any
 * actual search result blocks (as opposed to just text commentary).
 */
function hasWebSearchResults(contentBlocks: BetaContentBlock[]): boolean {
  return contentBlocks.some(
    block => block.type === 'web_search_tool_result' && Array.isArray(block.content) && block.content.length > 0,
  );
}

function makeToolSchema(input: Input): BetaWebSearchTool20250305 {
  return {
    type: 'web_search_20250305',
    name: 'web_search',
    allowed_domains: input.allowed_domains,
    blocked_domains: input.blocked_domains,
    max_uses: 8, // Hardcoded to 8 searches maximum
  };
}

function makeOutputFromSearchResponse(result: BetaContentBlock[], query: string, durationSeconds: number): Output {
  // The result is a sequence of these blocks:
  // - text to start -- always?
  // [
  //    - server_tool_use
  //    - web_search_tool_result
  //    - text and citation blocks intermingled
  //  ]+  (this block repeated for each search)

  const results: (SearchResult | string)[] = [];
  let textAcc = '';
  let inText = true;

  for (const block of result) {
    if (block.type === 'server_tool_use') {
      if (inText) {
        inText = false;
        if (textAcc.trim().length > 0) {
          results.push(textAcc.trim());
        }
        textAcc = '';
      }
      continue;
    }

    if (block.type === 'web_search_tool_result') {
      // Handle error case - content is a WebSearchToolResultError
      if (!Array.isArray(block.content)) {
        const errorMessage = `Web search error: ${block.content.error_code}`;
        logError(new Error(errorMessage));
        results.push(errorMessage);
        continue;
      }
      // Success case - add results to our collection
      const hits = block.content.map(r => ({ title: r.title, url: r.url }));
      results.push({
        tool_use_id: block.tool_use_id,
        content: hits,
      });
    }

    if (block.type === 'text') {
      if (inText) {
        textAcc += block.text;
      } else {
        inText = true;
        textAcc = block.text;
      }
    }
  }

  if (textAcc.length) {
    results.push(textAcc.trim());
  }

  return {
    query,
    results,
    durationSeconds,
  };
}

/**
 * Direct search fallback for non-Anthropic providers.
 * Skips the Anthropic server-side web_search model call and goes
 * straight to Tavily/Brave/Serper/DuckDuckGo.
 */
async function directSearchFallback(query: string, startTime: number, onProgress?: any): Promise<{ data: Output }> {
  const fallbackProvider = selectBestDirectProvider();

  if (onProgress) {
    onProgress({
      toolUseID: 'search-direct',
      data: { type: 'query_update', query: `[${fallbackProvider}] ${query}` },
    });
  }

  const response = await searchWithProvider(fallbackProvider, query, { num: 10 });

  if (onProgress) {
    onProgress({
      toolUseID: 'search-direct-results',
      data: {
        type: 'search_results_received',
        resultCount: response.results.length,
        query: `[${fallbackProvider}] ${query}`,
      },
    });
  }

  const durationSeconds = (performance.now() - startTime) / 1000;
  const results: (SearchResult | string)[] = [];

  if (response.results.length > 0) {
    results.push({
      tool_use_id: `direct-${fallbackProvider}`,
      content: response.results.map(r => ({
        title: r.title,
        url: r.url,
      })),
    });
  }

  return {
    data: {
      query,
      results,
      durationSeconds,
    },
  };
}

export const WebSearchTool = buildTool({
  name: WEB_SEARCH_TOOL_NAME,
  searchHint: 'search the web for current information',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description(input) {
    return `Claude wants to search the web for: ${input.query}`;
  },
  userFacingName() {
    return 'Web Search';
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input);
    return summary ? `Searching for ${summary}` : 'Searching the web';
  },
  isEnabled() {
    const provider = getAPIProvider();

    // Anthropic providers use the native server-side web_search tool
    if (provider === 'firstParty' || provider === 'foundry') {
      return true;
    }

    // Vertex AI with Claude 4.0+ models supports web_search
    if (provider === 'vertex') {
      const model = getMainLoopModel();
      const supportsWebSearch =
        model.includes('claude-opus-4') || model.includes('claude-sonnet-4') || model.includes('claude-haiku-4');
      return supportsWebSearch;
    }

    // For all other providers (OpenAI, Google, OpenRouter, Ollama,
    // DeepSeek, etc.), the Anthropic server-side web_search tool is not
    // available. Only enable WebSearch if a good API-key-based search
    // provider (Tavily/Brave/Serper) is configured — DuckDuckGo alone
    // gives too-poor results. When disabled, the model will use MCP
    // search tools (tinyfish, firecrawl) which return richer results.
    return isProviderConfigured('tavily') || isProviderConfigured('brave') || isProviderConfigured('serper');
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  toAutoClassifierInput(input) {
    return input.query;
  },
  async checkPermissions(_input): Promise<PermissionResult> {
    return {
      behavior: 'passthrough',
      message: 'WebSearchTool requires permission.',
      suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: WEB_SEARCH_TOOL_NAME }],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ],
    };
  },
  async prompt() {
    return getWebSearchPrompt();
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
  extractSearchText() {
    // renderToolResultMessage shows only "Did N searches in Xs" chrome —
    // the results[] content never appears on screen. Heuristic would index
    // string entries in results[] (phantom match). Nothing to search.
    return '';
  },
  async validateInput(input) {
    const { query, allowed_domains, blocked_domains } = input;
    if (!query.length) {
      return {
        result: false,
        message: 'Error: Missing query',
        errorCode: 1,
      };
    }
    if (allowed_domains?.length && blocked_domains?.length) {
      return {
        result: false,
        message: 'Error: Cannot specify both allowed_domains and blocked_domains in the same request',
        errorCode: 2,
      };
    }
    return { result: true };
  },
  async call(input, context, _canUseTool, _parentMessage, onProgress) {
    const startTime = performance.now();
    const { query } = input;

    // For non-Anthropic providers (OpenAI, Google, OpenRouter, DeepSeek,
    // OpenCode, KiloCode, Ollama, etc.), the Anthropic server-side
    // web_search_20250305 tool is not supported. Skip directly to the
    // direct-search fallback instead of making an expensive model API
    // call that will inevitably fail or hang.
    if (!isAnthropicProvider()) {
      return directSearchFallback(query, startTime, onProgress);
    }

    const userMessage = createUserMessage({
      content: 'Perform a web search for the query: ' + query,
    });
    const toolSchema = makeToolSchema(input);

    const useHaiku = getFeatureValue_CACHED_MAY_BE_STALE('tengu_plum_vx3', false);

    const appState = context.getAppState();
    const queryStream = queryModelWithStreaming({
      messages: [userMessage],
      systemPrompt: asSystemPrompt(['You are an assistant for performing a web search tool use']),
      thinkingConfig: useHaiku ? { type: 'disabled' as const } : context.options.thinkingConfig,
      tools: [],
      signal: context.abortController.signal,
      options: {
        getToolPermissionContext: async () => appState.toolPermissionContext,
        model: useHaiku ? getSmallFastModel() : context.options.mainLoopModel,
        toolChoice: useHaiku ? { type: 'tool', name: 'web_search' } : undefined,
        isNonInteractiveSession: context.options.isNonInteractiveSession,
        hasAppendSystemPrompt: !!context.options.appendSystemPrompt,
        extraToolSchemas: [toolSchema],
        querySource: 'web_search_tool',
        agents: context.options.agentDefinitions.activeAgents,
        mcpTools: [],
        agentId: context.agentId,
        parentAgentId: context.parentAgentId,
        effortValue: appState.effortValue,
      },
    });

    const allContentBlocks: BetaContentBlock[] = [];
    let currentToolUseId = null;
    let currentToolUseJson = '';
    let progressCounter = 0;
    const toolUseQueries = new Map(); // Map of tool_use_id to query
    let streamError: Error | null = null;

    try {
      for await (const event of queryStream) {
        if (event.type === 'assistant') {
          allContentBlocks.push(...event.message.content);
          continue;
        }

        // Track tool use ID when server_tool_use starts
        if (event.type === 'stream_event' && event.event?.type === 'content_block_start') {
          const contentBlock = event.event.content_block;
          if (contentBlock && contentBlock.type === 'server_tool_use') {
            currentToolUseId = contentBlock.id;
            currentToolUseJson = '';
            // Note: The ServerToolUseBlock doesn't contain input.query
            // The actual query comes through input_json_delta events
            continue;
          }
        }

        // Accumulate JSON for current tool use
        if (currentToolUseId && event.type === 'stream_event' && event.event?.type === 'content_block_delta') {
          const delta = event.event.delta;
          if (delta?.type === 'input_json_delta' && delta.partial_json) {
            currentToolUseJson += delta.partial_json;

            // Try to extract query from partial JSON for progress updates
            try {
              // Look for a complete query field
              const queryMatch = currentToolUseJson.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"/);
              if (queryMatch && queryMatch[1]) {
                // The regex properly handles escaped characters
                const query = jsonParse('"' + queryMatch[1] + '"');

                if (!toolUseQueries.has(currentToolUseId) || toolUseQueries.get(currentToolUseId) !== query) {
                  toolUseQueries.set(currentToolUseId, query);
                  progressCounter++;
                  if (onProgress) {
                    onProgress({
                      toolUseID: `search-progress-${progressCounter}`,
                      data: {
                        type: 'query_update',
                        query,
                      },
                    });
                  }
                }
              }
            } catch {
              // Ignore parsing errors for partial JSON
            }
          }
        }

        // Yield progress when search results come in
        if (event.type === 'stream_event' && event.event?.type === 'content_block_start') {
          const contentBlock = event.event.content_block;
          if (contentBlock && contentBlock.type === 'web_search_tool_result') {
            // Get the actual query that was used for this search
            const toolUseId = contentBlock.tool_use_id;
            const actualQuery = toolUseQueries.get(toolUseId) || query;
            const content = contentBlock.content;

            progressCounter++;
            if (onProgress) {
              onProgress({
                toolUseID: toolUseId || `search-progress-${progressCounter}`,
                data: {
                  type: 'search_results_received',
                  resultCount: Array.isArray(content) ? content.length : 0,
                  query: actualQuery,
                },
              });
            }
          }
        }
      }
    } catch (err) {
      // If the Anthropic streaming call fails entirely (e.g., provider
      // doesn't support the model), capture the error and let the
      // fallback below handle it.
      streamError = err instanceof Error ? err : new Error(String(err));
      logError(streamError);
    }

    // Process the final result
    const endTime = performance.now();
    const durationSeconds = (endTime - startTime) / 1000;

    // If the Anthropic server-side web_search returned 0 results (e.g.,
    // non-Anthropic provider, model doesn't support the tool, or search
    // returned nothing), fall back to direct search providers.
    const useFallback = streamError !== null || !hasWebSearchResults(allContentBlocks);
    if (useFallback) {
      try {
        const fallbackProvider = selectBestDirectProvider();

        // Report progress so the UI doesn't look stuck
        if (onProgress) {
          onProgress({
            toolUseID: `search-progress-${progressCounter + 1}`,
            data: {
              type: 'query_update',
              query: `[${fallbackProvider}] ${query}`,
            },
          });
        }

        const fallbackStart = performance.now();
        const response = await searchWithProvider(fallbackProvider, query, {
          num: 10,
        });
        const fallbackDuration = (performance.now() - fallbackStart) / 1000 + durationSeconds;

        progressCounter++;
        if (onProgress) {
          onProgress({
            toolUseID: `search-progress-${progressCounter}`,
            data: {
              type: 'search_results_received',
              resultCount: response.results.length,
              query: `[${fallbackProvider}] ${query}`,
            },
          });
        }

        if (response.results.length > 0) {
          const results: (SearchResult | string)[] = [
            ...(allContentBlocks
              .filter(b => b.type === 'text')
              .map(b => (b as any).text?.trim?.())
              .filter(Boolean) as string[]),
          ];

          // Build a search result from the direct provider response
          results.push({
            tool_use_id: `direct-${fallbackProvider}`,
            content: response.results.map(r => ({
              title: r.title,
              url: r.url,
            })),
          });

          const data: Output = {
            query,
            results,
            durationSeconds: fallbackDuration,
          };
          return { data };
        }
      } catch (err) {
        // Log but continue — fall back to the original (empty) result below.
        logError(
          new Error(`WebSearch direct-search fallback failed: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    }

    const data = makeOutputFromSearchResponse(allContentBlocks, query, durationSeconds);
    return { data };
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const { query, results } = output;

    let formattedOutput = `Web search results for query: "${query}"\n\n`;

    // Process the results array - it can contain both string summaries and search result objects.
    // Guard against null/undefined entries that can appear after JSON round-tripping
    // (e.g., from compaction or transcript deserialization).
    (results ?? []).forEach(result => {
      if (result == null) {
        return;
      }
      if (typeof result === 'string') {
        // Text summary
        formattedOutput += result + '\n\n';
      } else {
        // Search result with links
        if (result.content?.length > 0) {
          formattedOutput += `Links: ${jsonStringify(result.content)}\n\n`;
        } else {
          formattedOutput += 'No links found.\n\n';
        }
      }
    });

    formattedOutput +=
      '\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.';

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formattedOutput.trim(),
    };
  },
} satisfies ToolDef<InputSchema, Output, WebSearchProgress>);
