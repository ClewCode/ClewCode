import { describe, expect, test } from 'bun:test';
import { aggregateLocalUsageRecords, parseLocalUsageJsonl, type LocalUsageRecord } from './localUsageAnalytics.js';

const NOW = new Date('2026-07-14T10:00:00.000Z');

function assistant(timestamp: string, overrides: Partial<LocalUsageRecord> = {}): LocalUsageRecord {
  return {
    type: 'assistant',
    timestamp,
    sessionId: 'current',
    message: {
      model: 'claude-opus-4-8',
      usage: {
        input_tokens: 823,
        output_tokens: 99_900,
        cache_read_input_tokens: 17_200_000,
        cache_creation_input_tokens: 632_200,
        costUSD: 17.43,
      },
      content: [],
    },
    ...overrides,
  };
}

describe('aggregateLocalUsageRecords', () => {
  test('aggregates the current session and includes the exact 24 hour boundary', () => {
    const result = aggregateLocalUsageRecords(
      [
        assistant('2026-07-13T10:00:00.000Z', {
          durationMs: 1_841_000,
          toolUseResult: {
            structuredPatch: [{ lines: ['+one', '+two', '-old', ' context'] }],
          },
        }),
        assistant('2026-07-14T09:00:00.000Z', {
          toolUseResult: {
            type: 'create',
            content: 'one\ntwo',
            structuredPatch: [],
          },
        }),
      ],
      { now: NOW, currentSessionId: 'current' },
    );

    expect(result.session).toEqual({
      costUSD: 34.86,
      apiDurationMs: 1_841_000,
      wallDurationMs: 82_800_000,
      linesAdded: 4,
      linesRemoved: 1,
    });
    expect(result.models['claude-opus-4-8']).toEqual({
      inputTokens: 1_646,
      outputTokens: 199_800,
      cacheReadInputTokens: 34_400_000,
      cacheCreationInputTokens: 1_264_400,
      costUSD: 34.86,
    });
  });

  test('excludes records older than 24 hours from contributing factors', () => {
    const result = aggregateLocalUsageRecords(
      [
        assistant('2026-07-13T09:59:59.999Z', { sessionId: 'old' }),
        assistant('2026-07-14T09:00:00.000Z', { sessionId: 'recent' }),
      ],
      { now: NOW, currentSessionId: 'missing' },
    );

    expect(result.highContextPercentage).toBe(100);
    expect(result.cacheMissPercentage).toBe(100);
  });

  test('attributes cache-miss usage to messages with >100k uncached input', () => {
    const highCacheMiss = {
      message: {
        model: 'claude-opus-4-8',
        usage: { input_tokens: 120_000, output_tokens: 100, cache_read_input_tokens: 5_000_000 },
        content: [],
      },
    };
    const lowCacheMiss = {
      message: {
        model: 'claude-opus-4-8',
        usage: { input_tokens: 800, output_tokens: 100, cache_read_input_tokens: 4_000 },
        content: [],
      },
    };
    const result = aggregateLocalUsageRecords(
      [assistant('2026-07-14T09:00:00.000Z', highCacheMiss), assistant('2026-07-14T09:30:00.000Z', lowCacheMiss)],
      { now: NOW },
    );

    // First message (5,120,100 tokens) dwarfs the second (4,900), so it hit a
    // cache miss on ~100% of recent token volume even though it's 1 of 2 messages.
    expect(result.cacheMissPercentage).toBe(100);
  });

  test('attributes only direct skill, plugin, and MCP evidence and omits empty groups', () => {
    const result = aggregateLocalUsageRecords(
      [
        assistant('2026-07-14T09:00:00.000Z', {
          message: {
            model: 'claude-opus-4-8',
            usage: { input_tokens: 100, output_tokens: 0 },
            content: [
              { type: 'tool_use', name: 'Skill', input: { skill: 'superpowers:brainstorming' } },
              { type: 'tool_use', name: 'mcp__tinyfish__search', input: {} },
            ],
          },
        }),
        assistant('2026-07-14T09:30:00.000Z', {
          message: {
            model: 'claude-opus-4-8',
            usage: { input_tokens: 100, output_tokens: 0 },
            content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'commit' } }],
          },
        }),
      ],
      { now: NOW },
    );

    expect(result.contributionGroups).toEqual([
      {
        title: 'Skills',
        entries: [
          { name: '/commit', percentage: 50 },
          { name: '/superpowers:brainstorming', percentage: 50 },
        ],
      },
      { title: 'Plugins', entries: [{ name: 'superpowers', percentage: 50 }] },
      { title: 'MCP servers', entries: [{ name: 'tinyfish', percentage: 50 }] },
    ]);
  });
});

describe('parseLocalUsageJsonl', () => {
  test('skips malformed and unknown JSONL entries', () => {
    const records = parseLocalUsageJsonl(
      `${JSON.stringify(assistant('2026-07-14T09:00:00.000Z'))}\nnot-json\n{"type":"summary"}\n`,
    );

    expect(records).toHaveLength(1);
    expect(records[0]?.type).toBe('assistant');
  });
});
