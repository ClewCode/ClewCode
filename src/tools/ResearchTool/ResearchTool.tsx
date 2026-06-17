import { z } from 'zod/v4';
import { queryModelWithStreaming } from '../../services/api/claude.js';
import { buildTool, findToolByName } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { logError } from '../../utils/log.js';
import { createUserMessage } from '../../utils/messages.js';
import { asSystemPrompt } from '../../utils/systemPromptType.js';
import { type DeepDiveResult, filterDeepDiveResults, performDeepDive } from './deepDive.js';
import { type DossierData, generateDossierData, saveDossier } from './dossierGenerator.js';
import { type SearchProviderResult, searchWithProviders } from './searchProviders.js';
import { calculateSourceScore, generateRankingReport, rankSources } from './smartSourceRanking.js';
import {
  assessSourceCredibility,
  detectConflicts,
  generateTruthCheckSummary,
  type SourceCredibility,
  type TruthCheckResult,
} from './truthChecker.js';

interface WebResult {
  type: 'duckduckgo' | 'tavily' | 'brave';
  title: string;
  url: string;
  excerpt: string;
  content: string;
}

function dedupeResults<T extends { url?: string; title: string }>(results: T[]): T[] {
  const seen = new Set<string>();
  return results.filter(result => {
    const key = result.url || result.title;
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const inputSchema = lazySchema(() =>
  z.object({
    query: z.string().describe('The research query to search for'),
    sources: z
      .array(z.enum(['web', 'code', 'docs', 'mcp']))
      .optional()
      .describe('Sources to research'),
    maxResults: z.number().optional().describe('Maximum number of results to return per source'),
    enableDeepDive: z.boolean().optional().describe('Enable deep-dive mode to follow links 2-3 levels deep'),
    deepDiveLevels: z.number().optional().describe('Number of levels to dive deep (1-3, default: 2)'),
    enableTruthCheck: z.boolean().optional().describe('Enable truth-checking and conflict detection'),
    generateDossier: z.boolean().optional().describe('Generate and save a Markdown research dossier'),
    dossierOutputDir: z
      .string()
      .optional()
      .describe('Output directory for the dossier (default: ~/.claude/research-dossiers)'),
    enableSmartRanking: z.boolean().optional().describe('Enable smart source ranking to filter SEO spam'),
    excludeSpam: z.boolean().optional().describe('Exclude low-quality and spam sources'),
    minSourceScore: z.number().optional().describe('Minimum source credibility score (0-100)'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    answer: z.string(),
    sources: z.array(
      z.object({
        type: z.string(),
        title: z.string(),
        url: z.string().optional(),
        excerpt: z.string(),
        credibilityScore: z.number().optional(),
        tier: z.string().optional(),
      }),
    ),
    followUpQuestions: z.array(z.string()).optional(),
    error: z.string().optional(),
    deepDiveResults: z
      .array(
        z.object({
          url: z.string(),
          level: z.number(),
          title: z.string(),
          excerpt: z.string(),
        }),
      )
      .optional(),
    truthCheckResult: z
      .object({
        summary: z.string(),
        conflicts: z.array(z.any()),
        recommendations: z.array(z.string()),
      })
      .optional(),
    dossierPath: z.string().optional(),
    rankingReport: z.string().optional(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;

export type Output = z.input<OutputSchema>;

export const ResearchTool = buildTool({
  name: 'research',
  searchHint: 'deep research with citations, truth-checking, and smart ranking',
  maxResultSizeChars: 500_000,

  get inputSchema(): InputSchema {
    return inputSchema();
  },

  get outputSchema(): OutputSchema {
    return outputSchema();
  },

  description: async ({ query }) => `Research: ${query}`,

  prompt: async () => {
    return `Use the research tool for deep research with multiple sources, citations, truth-checking, and smart source ranking.`;
  },

  async validateInput({ query }) {
    if (!query || query.trim().length === 0) {
      return {
        result: false,
        message: 'Query cannot be empty',
        errorCode: 1,
      };
    }
    return { result: true };
  },

  async checkPermissions() {
    return {
      behavior: 'allow',
    };
  },

  async call(args: any, context: any): Promise<any> {
    const {
      query,
      sources = ['web', 'code', 'docs'],
      maxResults = 5,
      enableDeepDive = false,
      deepDiveLevels = 2,
      enableTruthCheck = false,
      generateDossier = false,
      dossierOutputDir,
      enableSmartRanking = true,
      excludeSpam = true,
      minSourceScore = 0,
    } = args;

    try {
      const appState = context.getAppState();
      const availableTools = appState.toolPermissionContext.tools;

      const shouldSearchWeb = sources.includes('web');

      console.log('[ResearchTool] Starting research with features:', {
        query,
        enableDeepDive,
        enableTruthCheck,
        generateDossier,
        enableSmartRanking,
      });

      const providerResults = shouldSearchWeb ? await searchWithProviders(query, { maxResults }) : [];

      console.log('[ResearchTool] Provider results:', {
        query,
        providerCount: providerResults.length,
        totalResults: providerResults.reduce((sum: number, p: SearchProviderResult) => sum + p.results.length, 0),
        providers: providerResults.map((p: SearchProviderResult) => ({
          source: p.source,
          resultCount: p.results.length,
        })),
      });

      let allWebResults: WebResult[] = dedupeResults(
        providerResults.flatMap((provider: SearchProviderResult) =>
          provider.results.map(result => ({
            type: provider.source as 'duckduckgo' | 'tavily' | 'brave',
            title: result.title,
            url: result.url || '',
            excerpt: result.excerpt,
            content: (result as any).content || (result as any).description || '',
          })),
        ),
      );

      const foundCount = allWebResults.length;
      console.log('[ResearchTool] Deduplicated results count:', foundCount);

      let rankingReport: string | undefined;
      if (enableSmartRanking && allWebResults.length > 0) {
        console.log('[ResearchTool] Applying smart source ranking...');

        const rankedSources = rankSources(
          allWebResults.map(r => ({
            url: r.url || '',
            title: r.title,
            excerpt: r.excerpt,
            content: r.content,
            type: r.type,
          })),
          {
            preferOfficial: true,
            excludeSpam,
            minScore: minSourceScore,
          },
        );

        const scores = rankedSources.map(s => s.score);
        rankingReport = generateRankingReport(scores);

        allWebResults = rankedSources.map(r => ({
          type: (r.type as 'duckduckgo' | 'tavily' | 'brave') || 'duckduckgo',
          title: r.title,
          url: r.url,
          excerpt: r.excerpt,
          content: (r as any).content || '',
        }));

        console.log('[ResearchTool] Smart ranking applied. Results after ranking:', allWebResults.length);
      }

      let deepDiveResults:
        | Array<{
            url: string;
            level: number;
            title: string;
            excerpt: string;
          }>
        | undefined;

      if (enableDeepDive && allWebResults.length > 0) {
        console.log('[ResearchTool] Starting deep-dive mode...');

        const urlsToDive = allWebResults
          .filter(r => r.url)
          .slice(0, 5)
          .map(r => r.url);

        const diveResults = await performDeepDive(urlsToDive, {
          maxLevels: deepDiveLevels,
          maxLinksPerLevel: 5,
        });

        const filteredDiveResults = filterDeepDiveResults(diveResults, query);

        deepDiveResults = filteredDiveResults.map(r => ({
          url: r.originalUrl,
          level: r.level,
          title: r.title,
          excerpt: r.excerpt,
        }));

        console.log('[ResearchTool] Deep-dive completed. Found', deepDiveResults.length, 'relevant deep results');
      }

      const searchResultsText = allWebResults
        .map((result, index) => {
          let text = `${index + 1}. [${result.type}] ${result.title}\nURL: ${result.url || 'N/A'}\nExcerpt: ${result.excerpt}`;

          if (enableSmartRanking && result.url) {
            const score = calculateSourceScore(result.url, result.title, result.excerpt);
            text += `\nCredibility: ${score.score}/100 (${score.tier})`;
          }

          return text;
        })
        .join('\n\n');

      let searchContext = `Research Query: ${query}\n\nFound ${foundCount} results from web search providers.\n\n`;

      if (foundCount > 0) {
        searchContext += `### Web Search Results:\n\n${searchResultsText}\n\n`;
      } else {
        searchContext += 'No web search results found.\n\n';
      }

      if (deepDiveResults && deepDiveResults.length > 0) {
        searchContext += `\n### Deep Dive Results (${deepDiveResults.length} additional pages):\n\n`;
        deepDiveResults.forEach((result, index) => {
          searchContext += `${index + 1}. [Level ${result.level}] ${result.title}\nURL: ${result.url}\nExcerpt: ${result.excerpt}\n\n`;
        });
      }

      searchContext += `
Please perform deep research for the query.
1. Synthesize a comprehensive, well-structured answer based on the PROVIDED search results${deepDiveResults ? ' and deep-dive results' : ''}.
2. Use other project tools (like code/file read) if needed to gather more context.
3. Include proper citations for all claims using source URLs.
4. Generate thoughtful follow-up questions for deeper exploration.`;

      if (enableTruthCheck) {
        searchContext += `\n5. IMPORTANT: Analyze the sources for conflicting information and note any discrepancies.`;
      }

      const userMessage = createUserMessage({
        content: searchContext,
      });

      console.log('[ResearchTool] Provider search completed. Found', foundCount, 'results. Starting synthesis...');

      const synthesisTools = availableTools.filter((t: any) => {
        const name = t.name.toLowerCase();
        const isForbidden = name === 'research' || name === 'agent' || name.includes('search') || name.includes('web');
        return !isForbidden;
      });

      console.log(
        '[ResearchTool] Aggressive Filter - Excluded tools:',
        availableTools
          .filter((t: any) => {
            const name = t.name.toLowerCase();
            return name === 'research' || name === 'agent' || name.includes('search') || name.includes('web');
          })
          .map((t: any) => t.name),
      );
      console.log(
        '[ResearchTool] Aggressive Filter - Allowed tools:',
        synthesisTools.map((t: any) => t.name),
      );

      let answer = '';
      let eventCount = 0;
      const synthesisMessages = [userMessage as any];
      let iterations = 0;
      const MAX_SYNTHESIS_ITERATIONS = 5;

      while (iterations < MAX_SYNTHESIS_ITERATIONS) {
        iterations++;
        console.log(`[ResearchTool] Synthesis iteration ${iterations}...`);

        const queryStream = queryModelWithStreaming({
          messages: synthesisMessages,
          systemPrompt: asSystemPrompt(
            [
              'You are a research assistant synthesizing search results.',
              'Use the provided search results as the primary evidence.',
              'Use additional project/file/code tools only when needed.',
              'Cite source URLs for factual claims.',
              'Format your response with clear sections.',
              enableTruthCheck
                ? 'Pay attention to conflicting information between sources and note discrepancies.'
                : '',
            ].filter(Boolean),
          ),
          thinkingConfig: context.options.thinkingConfig,
          tools: synthesisTools as any,
          signal: context.abortController.signal,
          options: {
            getToolPermissionContext: async () => appState.toolPermissionContext,
            model: context.options.mainLoopModel,
            isNonInteractiveSession: context.options.isNonInteractiveSession,
            hasAppendSystemPrompt: !!context.options.appendSystemPrompt,
            querySource: 'research_tool',
            agents: context.options.agentDefinitions?.activeAgents,
            mcpTools: appState.mcp?.tools,
            agentId: context.agentId,
            parentAgentId: context.parentAgentId,
            effortValue: appState.effortValue,
          } as any,
        });

        let hasToolUseInThisIteration = false;
        const currentAssistantContent: any[] = [];
        let currentAssistantText = '';

        for await (const event of queryStream) {
          eventCount++;
          if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
            answer += event.delta.text;
            currentAssistantText += event.delta.text;
          } else if (event.type === 'tool_use') {
            hasToolUseInThisIteration = true;
            console.log(`[ResearchTool] Sub-agent using tool: ${event.name}`);

            // Add what we have so far to the assistant message
            if (currentAssistantText) {
              currentAssistantContent.push({ type: 'text', text: currentAssistantText });
              currentAssistantText = '';
            }

            currentAssistantContent.push({
              type: 'tool_use',
              id: event.id,
              name: event.name,
              input: event.input,
            });

            // Execute the tool
            const toolToCall = findToolByName(context.options.tools, event.name);
            if (toolToCall) {
              try {
                // Call the tool. We pass context, canUseTool etc. from our own call arguments
                const toolResult = await toolToCall.call(
                  event.input,
                  context,
                  context.canUseTool || ((() => ({ behavior: 'allow' })) as any), // Fallback if not provided
                  context.parentMessage || ({} as any),
                );

                // Add the tool result to the messages for the next iteration
                synthesisMessages.push({
                  role: 'assistant',
                  content: currentAssistantContent.splice(0), // Move content out
                } as any);

                synthesisMessages.push({
                  role: 'user',
                  content: [
                    {
                      type: 'tool_result',
                      tool_use_id: event.id,
                      content: typeof toolResult.data === 'string' ? toolResult.data : JSON.stringify(toolResult.data),
                    },
                  ],
                } as any);
              } catch (error: any) {
                console.error(`[ResearchTool] Error executing sub-tool ${event.name}:`, error);
                synthesisMessages.push({
                  role: 'assistant',
                  content: currentAssistantContent.splice(0),
                } as any);
                synthesisMessages.push({
                  role: 'user',
                  content: [
                    {
                      type: 'tool_result',
                      tool_use_id: event.id,
                      content: `Error: ${error.message}`,
                      is_error: true,
                    },
                  ],
                } as any);
              }
            } else {
              console.warn(`[ResearchTool] Tool ${event.name} not found for sub-agent`);
            }
          }
        }

        if (!hasToolUseInThisIteration) {
          break; // No more tool calls, we are done
        }
      }

      console.log('[ResearchTool] Synthesis complete. Total events:', eventCount, 'Answer length:', answer.length);

      let truthCheckResult: any | undefined;

      if (enableTruthCheck && allWebResults.length > 1) {
        console.log('[ResearchTool] Running truth-check and conflict detection...');

        const credibilityScores: SourceCredibility[] = allWebResults
          .filter(r => r.url)
          .map(r => assessSourceCredibility(r.url));

        const sourcesForConflict = allWebResults
          .filter(r => r.url && (r.content || r.excerpt))
          .map(r => ({
            url: r.url,
            title: r.title,
            content: r.content || r.excerpt,
          }));

        const conflicts = detectConflicts(sourcesForConflict, query);

        const truthCheck: TruthCheckResult = generateTruthCheckSummary(conflicts, credibilityScores, query);

        truthCheckResult = {
          summary: truthCheck.summary,
          conflicts: truthCheck.conflicts,
          recommendations: truthCheck.recommendations,
        };

        console.log('[ResearchTool] Truth-check completed. Found', conflicts.length, 'conflict(s)');
      }

      let dossierPath: string | undefined;

      if (generateDossier) {
        console.log('[ResearchTool] Generating research dossier...');

        try {
          const dossierData: DossierData = generateDossierData(
            query,
            answer,
            allWebResults.map(r => ({
              type: r.type,
              title: r.title,
              url: r.url || '',
              excerpt: r.excerpt,
            })),
            deepDiveResults
              ? deepDiveResults.map(
                  r =>
                    ({
                      originalUrl: r.url,
                      level: r.level,
                      title: r.title,
                      content: '',
                      excerpt: r.excerpt,
                      links: [],
                    }) as DeepDiveResult,
                )
              : undefined,
            truthCheckResult
              ? {
                  query,
                  conflicts: truthCheckResult.conflicts.map((c: any) => ({
                    ...c,
                    confidence: c.confidence as 'high' | 'medium' | 'low',
                  })),
                  credibilityScores: allWebResults.filter(r => r.url).map(r => assessSourceCredibility(r.url)),
                  summary: truthCheckResult.summary,
                  recommendations: truthCheckResult.recommendations,
                }
              : undefined,
            [
              `What are the key findings about "${query}"?`,
              `What sources should be verified next?`,
              `Are there any conflicting viewpoints in the results?`,
              `What are the practical applications of this information?`,
            ],
          );

          dossierPath = await saveDossier(dossierData, {
            outputDir: dossierOutputDir,
            includeDeepDive: !!deepDiveResults,
            includeTruthCheck: !!truthCheckResult,
          });

          console.log('[ResearchTool] Dossier saved to:', dossierPath);
        } catch (error) {
          logError(error as Error);
          console.error('[ResearchTool] Failed to generate dossier:', error);
        }
      }

      const finalSources = allWebResults.map(r => {
        const source: any = {
          type: r.type,
          title: r.title,
          url: r.url,
          excerpt: r.excerpt,
        };

        if (enableSmartRanking && r.url) {
          const score = calculateSourceScore(r.url, r.title, r.excerpt);
          source.credibilityScore = score.score;
          source.tier = score.tier;
        }

        return source;
      });

      return {
        data: {
          success: true,
          answer: answer || `Research results for "${query}":\n\nFound ${foundCount} sources. No synthesis available.`,
          sources: finalSources,
          followUpQuestions: [
            `What are the key findings about "${query}"?`,
            `What sources should be verified next?`,
            `Are there any conflicting viewpoints in the results?`,
            `What are the practical applications of this information?`,
          ],
          deepDiveResults,
          truthCheckResult,
          dossierPath,
          rankingReport,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error('[ResearchTool] ERROR:', errorMessage);
      console.error('[ResearchTool] ERROR STACK:', errorStack);

      logError(error as Error);

      return {
        data: {
          success: false,
          answer: `Research failed: ${errorMessage}`,
          sources: [],
          followUpQuestions: [],
          error: errorMessage,
        },
      };
    }
  },

  mapToolResultToToolResultBlockParam(result: any, toolUseID: string) {
    if (!result.success && result.error) {
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: `## Research Failed\n\n${result.answer}\n\n**Error:** ${result.error}`,
      };
    }

    const sourcesText = result.sources
      .map((s: any) => {
        let text = `- [${s.type}] ${s.title}${s.url ? ` (${s.url})` : ''}`;
        if (s.credibilityScore !== undefined) {
          text += ` [Credibility: ${s.credibilityScore}/100]`;
        }
        return text;
      })
      .join('\n');

    let content = `## Research Results (Found ${result.sources.length} results)\n\n${result.answer}\n\n### Sources\n${sourcesText}`;

    if (result.deepDiveResults && result.deepDiveResults.length > 0) {
      content += `\n\n### Deep Dive Results (${result.deepDiveResults.length} pages)\n`;
      result.deepDiveResults.forEach((r: any) => {
        content += `- [Level ${r.level}] ${r.title} (${r.url})\n`;
      });
    }

    if (result.truthCheckResult) {
      content += `\n\n### Truth-Check Summary\n${result.truthCheckResult.summary}`;

      if (result.truthCheckResult.conflicts.length > 0) {
        content += `\n\n**Conflicts detected:** ${result.truthCheckResult.conflicts.length}`;
      }
    }

    if (result.dossierPath) {
      content += `\n\n### Research Dossier\nSaved to: ${result.dossierPath}`;
    }

    const followUpText = result.followUpQuestions
      ? `\n\nFollow-up questions:\n${result.followUpQuestions.map((q: string) => `- ${q}`).join('\n')}`
      : '';

    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: content + followUpText,
    };
  },

  renderToolUseMessage(args: any) {
    return `Researching: ${args.query}`;
  },
});
