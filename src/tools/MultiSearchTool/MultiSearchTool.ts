/**
 * MultiSearch Tool
 *
 * Provides web search via multiple providers:
 * - tavily: AI-optimized search (requires TAVILY_API_KEY)
 * - brave: Privacy-focused search (requires BRAVE_SEARCH_API_KEY)
 * - serper: Google Search API (requires SERPER_API_KEY)
 * - duckduckgo: Free, no API key required
 */

import { z } from 'zod/v4';
import {
  getAvailableProviders,
  getSearchProvider,
  isProviderConfigured,
  SEARCH_PROVIDERS,
  type SearchResponse,
  type SearchResult,
  searchWithProvider,
} from '../../services/search/index.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';

type ProviderInfo = {
  name: string;
  description: string;
  configured: boolean;
};

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(2).describe('The search query'),
    provider: z
      .enum(['auto', 'all', ...SEARCH_PROVIDERS])
      .optional()
      .default('auto')
      .describe('Search provider: auto (best), all (parallel all), or specific provider'),
    providers: z
      .array(z.enum(SEARCH_PROVIDERS))
      .optional()
      .describe('Specific providers to search in parallel (overrides provider)'),
    num: z.number().optional().default(10).describe('Maximum number of results per provider'),
    parallel: z.boolean().optional().default(true).describe('Search multiple providers in parallel'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    query: z.string(),
    provider: z.string(),
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string().optional(),
        relevanceScore: z.number().optional(),
        sourceProvider: z.string().optional(),
      }),
    ),
    totalResults: z.number().optional(),
    providersInfo: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
          configured: z.boolean(),
        }),
      )
      .optional(),
    searchMethod: z.enum(['single', 'parallel']).optional(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;

function selectBestProvider(): string {
  // Priority: tavily > brave > serper > searxng (if self-hosted) > duckduckgo
  if (isProviderConfigured('tavily')) return 'tavily';
  if (isProviderConfigured('brave')) return 'brave';
  if (isProviderConfigured('serper')) return 'serper';
  if (isProviderConfigured('searxng') && process.env.SEARXNG_INSTANCE_URL) return 'searxng';
  return 'duckduckgo';
}

function getProviderInfo(providerName: string) {
  const provider = getSearchProvider(providerName);
  return {
    name: provider?.name || providerName,
    description: provider?.description || '',
    configured: isProviderConfigured(providerName),
  };
}

export const MultiSearchTool = buildTool({
  name: 'MultiSearch',
  aliases: ['search', 'websearch'],
  searchHint: 'search the web using multiple providers',
  maxResultSizeChars: 50_000,
  userFacingName() {
    return 'Multi-Search';
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  isEnabled() {
    return true;
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  async description(input) {
    return `Search the web for: ${input.query}`;
  },
  async prompt() {
    const available = getAvailableProviders();
    return (
      'Use the MultiSearch tool to search the web.\n\n' +
      `Available providers:\n${available.map(p => `- ${p.name}: ${p.description} (${p.configured ? 'configured' : 'not configured'})`).join('\n')}\n\n` +
      'When provider="auto", selects the best configured provider automatically.\n' +
      'Returns title, URL, and snippet for each result.'
    );
  },
  async validateInput(input) {
    if (!input.query || input.query.trim().length < 2) {
      return { result: false, error: 'Query must be at least 2 characters' };
    }
    return { result: true };
  },
  async call({ query, provider: providerArg, providers: providersArg, num = 10, parallel = true }, _context) {
    // Determine which providers to use
    let providersToUse: string[] = [];

    if (providersArg && providersArg.length > 0) {
      // Explicit providers list provided
      providersToUse = providersArg;
    } else if (providerArg === 'all') {
      // Search all configured providers in parallel
      providersToUse = SEARCH_PROVIDERS.filter(p => isProviderConfigured(p) || p === 'duckduckgo');
    } else if (providerArg === 'auto') {
      providersToUse = [selectBestProvider()];
    } else {
      providersToUse = [providerArg];
    }

    // Filter to only configured providers
    const configuredProviders = providersToUse.filter(p => isProviderConfigured(p) || p === 'duckduckgo');

    if (configuredProviders.length === 0) {
      return {
        data: {
          query,
          provider: 'none',
          results: [],
          error: 'No providers configured. Set API keys in settings.',
        },
      };
    }

    try {
      let finalResults: SearchResult[] = [];
      const allProviderInfo: ProviderInfo[] = [];
      let searchMethod: 'single' | 'parallel' = 'single';

      if (parallel && configuredProviders.length > 1) {
        // Parallel search
        searchMethod = 'parallel';
        const searchPromises = configuredProviders.map(p =>
          searchWithProvider(p, query, { num }).catch(
            err =>
              ({
                results: [],
                provider: p,
                query,
                error: err.message,
              }) as SearchResponse,
          ),
        );

        const responses = await Promise.all(searchPromises);

        // Merge and dedupe results
        const seenUrls = new Set<string>();
        for (const response of responses) {
          allProviderInfo.push({
            name: response.provider,
            description: getSearchProvider(response.provider)?.description || '',
            configured: true,
          });

          for (const result of response.results) {
            if (!seenUrls.has(result.url)) {
              seenUrls.add(result.url);
              finalResults.push({
                ...result,
                sourceProvider: response.provider,
              });
            }
          }
        }
      } else {
        // Single provider search
        const provider = configuredProviders[0];
        const response = await searchWithProvider(provider, query, { num });

        allProviderInfo.push({
          name: response.provider,
          description: getSearchProvider(response.provider)?.description || '',
          configured: true,
        });

        finalResults = response.results.map(r => ({
          ...r,
          sourceProvider: response.provider,
        }));
      }

      // Sort by relevance if available, otherwise by order
      finalResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

      return {
        data: {
          query,
          provider: searchMethod === 'parallel' ? configuredProviders.join(',') : configuredProviders[0],
          results: finalResults.slice(0, num * configuredProviders.length),
          totalResults: finalResults.length,
          providersInfo: allProviderInfo,
          searchMethod,
        },
      };
    } catch (error) {
      return {
        data: {
          query,
          provider,
          results: [],
          error: error instanceof Error ? error.message : String(error),
          providerInfo: getProviderInfo(provider),
        },
      };
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const { query, provider, results, providerInfo } = output;

    let content = `🔍 Search: "${query}" (via ${provider})\n\n`;

    if (results.length === 0) {
      content += 'No results found.\n';
    } else {
      results.forEach((r, i) => {
        content += `${i + 1}. [${r.title}](${r.url})\n`;
        if (r.snippet) {
          content += `   ${r.snippet.slice(0, 200)}...\n`;
        }
        content += '\n';
      });
    }

    if (providerInfo && !providerInfo.configured && provider !== 'duckduckgo') {
      content += `\n⚠️ Provider not configured. Set ${getSearchProvider(provider)?.apiKeyEnvVar} to use.\n`;
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: content.trim(),
    };
  },
} satisfies ToolDef<InputSchema, z.infer<OutputSchema>>);

export function getSearchProvidersList() {
  return getAvailableProviders();
}
