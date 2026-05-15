import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import {
  searchSessions,
  indexNewSessions,
  getSearchStats,
  type SessionSearchResult,
} from '../../services/sessionSearch/sessionSearchDb.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  SESSION_SEARCH_TOOL_NAME,
  getDescription,
} from './prompt.js'

// ============================================================================
// Schema
// ============================================================================

export const inputSchema = lazySchema(() =>
  z.object({
    query: z
      .string()
      .describe(
        'Search query to find in past session transcripts. Use specific keywords, error messages, or phrases.',
      ),
    max_results: z
      .number()
      .optional()
      .default(10)
      .describe('Maximum number of results to return (default: 10, max: 20)'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export const outputSchema = lazySchema(() =>
  z.object({
    results: z.array(
      z.object({
        session_id: z.string(),
        role: z.string(),
        content: z.string(),
        timestamp: z.string(),
      }),
    ),
    total_indexed_sessions: z.number(),
    total_indexed_messages: z.number(),
    query: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

// ============================================================================
// Tool
// ============================================================================

function buildSearchResult(
  results: SessionSearchResult[],
  stats: { totalSessions: number; totalMessages: number },
  query: string,
): { data: Output } {
  return {
    data: {
      results: results.map(r => ({
        session_id: r.sessionId,
        role: r.role,
        content: r.content,
        timestamp: r.timestamp,
      })),
      total_indexed_sessions: stats.totalSessions,
      total_indexed_messages: stats.totalMessages,
      query,
    },
  }
}

export const SessionSearchTool = buildTool({
  isEnabled() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  name: SESSION_SEARCH_TOOL_NAME,
  maxResultSizeChars: 100_000,
  async description() {
    return getDescription()
  },
  async prompt() {
    return getDescription()
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async call(input) {
    const { query, max_results = 10 } = input

    // Ensure any new sessions are indexed before searching
    indexNewSessions()

    const results = searchSessions(query, Math.min(max_results, 20))
    const stats = getSearchStats()

    return buildSearchResult(results, stats, query)
  },
  renderToolUseMessage() {
    return null
  },
  userFacingName: () => '',
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
  ): ToolResultBlockParam {
    if (content.results.length === 0) {
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: `No results found for "${content.query}" in ${content.total_indexed_messages} indexed messages across ${content.total_indexed_sessions} sessions.`,
      }
    }

    const lines: string[] = [
      `Found ${content.results.length} results for "${content.query}":`,
      '',
    ]

    for (let i = 0; i < content.results.length; i++) {
      const r = content.results[i]!
      lines.push(
        `[${i + 1}] Session: ${r.session_id.slice(0, 8)} | ${r.role} | ${r.timestamp?.slice(0, 10) ?? 'unknown'}`,
      )
      lines.push(`    ${r.content.slice(0, 300)}`)
      if (r.content.length > 300) lines.push('    ...')
      lines.push('')
    }

    lines.push(
      `(Indexed: ${content.total_indexed_messages} messages, ${content.total_indexed_sessions} sessions)`,
    )

    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: lines.join('\n'),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
