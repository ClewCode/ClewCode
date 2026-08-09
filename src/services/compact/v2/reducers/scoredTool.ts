/**
 * `scored-tool` — model-guided eviction of old tool results.
 *
 * `stale-tool` keeps the most recent N compactable results and evicts the
 * rest on pure recency. That is a good default but a dumb one: a huge Read
 * of a file the session has moved past is cheap to lose, while a small Grep
 * right before the last user message may still be load-bearing.
 *
 * This reducer runs the same candidate selection as `stale-tool`, then asks
 * the model which candidates are safe to forget (one fork call, cache-shared
 * with the parent request). Results the model declines to mark are kept. It
 * sits above `stale-tool` in loss because it spends an LLM call — the planner
 * only reaches it when recency-based eviction cannot cover the deficit.
 *
 * Falls back to plain `stale-tool` behaviour whenever the model path is
 * unavailable (no cache-safe params, fork error).
 */
import type { Message } from '../../../../types/message.js';
import { logForDebugging } from '../../../../utils/debug.js';
import { runForkedAgent } from '../../../../utils/forkedAgent.js';
import { createCompactCanUseTool } from '../../compact.js';
import { collectCompactableToolIds, evaluateTimeBasedTrigger } from '../../microCompact.js';
import type { ReduceContext, Reducer } from '../types.js';
import {
  type EvictionSelection,
  estimateSelection,
  evictSelectedToolResults,
  labelForToolUse,
} from './evictToolResults.js';
import { KEEP_RECENT_COLD_CACHE, KEEP_RECENT_DEFAULT } from './staleTool.js';

/** Candidate blocks beyond this many recent are offered to the model. */
const MAX_CANDIDATES = 24;
/** Fewer candidates than this are not worth a fork round-trip. */
const MIN_CANDIDATES_FOR_FORK = 3;
/** Per-candidate preview length in the scoring prompt. */
const PREVIEW_LEN = 160;

function keepRecentFor(ctx: ReduceContext): number {
  const trigger = evaluateTimeBasedTrigger(ctx.messages, ctx.querySource);
  if (!trigger) return KEEP_RECENT_DEFAULT;
  return Math.max(1, Math.min(KEEP_RECENT_COLD_CACHE, trigger.config.keepRecent));
}

interface Candidate {
  id: string;
  label: string;
  preview: string;
}

/**
 * Candidate tool_use ids (bodies eligible for eviction) with a label and a
 * short preview for the scoring prompt. Same selection as stale-tool: the
 * most recent `keepRecent` compactable ids are never candidates.
 */
export function collectScoredCandidates(messages: Message[], keepRecent: number): Candidate[] {
  const compactableIds = collectCompactableToolIds(messages);
  const keep = new Set(compactableIds.slice(-Math.max(1, keepRecent)));
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.type !== 'assistant' || !Array.isArray(message.message.content)) continue;
    for (const block of message.message.content) {
      if (block.type !== 'tool_use' || !block.id) continue;
      const id = block.id;
      if (keep.has(id) || !compactableIds.includes(id) || seen.has(id)) continue;
      seen.add(id);
      if (candidates.length >= MAX_CANDIDATES) break;
      candidates.push({
        id,
        label: labelForToolUse(block.name, block.input),
        preview: previewFor(block.input),
      });
    }
  }
  return candidates;
}

function previewFor(input: unknown): string {
  const record = (input ?? {}) as Record<string, unknown>;
  const key = record.file_path ?? record.pattern ?? record.command ?? record.url ?? '';
  const text = typeof key === 'string' ? key : JSON.stringify(input).slice(0, 80);
  return text.slice(0, PREVIEW_LEN);
}

function toSelection(candidates: Candidate[]): EvictionSelection {
  const targets = new Map<string, string>();
  for (const c of candidates) targets.set(c.id, c.label);
  return { targets };
}

function lastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type !== 'user') continue;
    const content = m.message.content;
    if (typeof content === 'string') return content.slice(0, 300);
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text)
      .join('\n');
    if (text.trim()) return text.slice(0, 300);
  }
  return '(none yet)';
}

function buildScorePrompt(candidates: Candidate[], lastUser: string): string {
  const items = candidates
    .map((c, i) => `${i + 1}. [${c.id}] ${c.label}\n   preview: ${c.preview || '(no path/pattern)'}`)
    .join('\n');
  return `You are deciding which old tool results a coding agent may forget to reclaim context.

Last user request: ${lastUser || '(none)'}

Candidate tool results (oldest first, ${candidates.length} total):
${items}

Return the indexes that are SAFE to forget — results the agent is unlikely to need again (finished reads, one-shot searches superseded by later turns). Keep anything load-bearing: a definition the task still references, an error the task is actively debugging, or a recently used file. Respond with ONLY a JSON array of numbers, e.g. [1, 3]. If unsure, return [].`;
}

/** Parse a bare JSON array of 1-based indexes from the model reply. */
function parseSafeIndexes(text: string): Set<number> {
  const m = text.match(/\[[\s\d,]*\]/);
  if (!m) return new Set();
  const indexes = m[0]
    .replace(/[[\]\s]/g, '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  return new Set(indexes.filter(n => Number.isInteger(n) && n >= 1).map(n => n - 1));
}

export const scoredToolReducer: Reducer = {
  name: 'scored-tool',
  loss: 0.3,
  costly: true,
  estimate(ctx) {
    const candidates = collectScoredCandidates(ctx.messages, keepRecentFor(ctx));
    return estimateSelection(ctx.messages, toSelection(candidates).targets);
  },
  async apply(ctx) {
    const candidates = collectScoredCandidates(ctx.messages, keepRecentFor(ctx));
    if (candidates.length === 0) {
      return { messages: ctx.messages, tokensFreed: 0, evicted: [] };
    }

    if (ctx.cacheSafeParams && candidates.length >= MIN_CANDIDATES_FOR_FORK) {
      try {
        const safeIndexes = await scoreWithModel(ctx, candidates);
        if (safeIndexes.size > 0) {
          const doomed = candidates.filter((_, i) => safeIndexes.has(i));
          return evictSelectedToolResults(ctx, toSelection(doomed), 'scored-tool');
        }
        return { messages: ctx.messages, tokensFreed: 0, evicted: [] };
      } catch (err) {
        logForDebugging(`compact-v2 scored-tool fork failed, falling back to stale-tool: ${err}`);
      }
    }

    // Fallback: same selection stale-tool would make.
    return evictSelectedToolResults(ctx, toSelection(candidates), 'scored-tool');
  },
};

async function scoreWithModel(ctx: ReduceContext, candidates: Candidate[]): Promise<Set<number>> {
  const result = await runForkedAgent({
    promptMessages: [
      {
        type: 'user',
        uuid: crypto.randomUUID(),
        message: { role: 'user', content: buildScorePrompt(candidates, lastUserText(ctx.messages)) },
      } as Message,
    ],
    cacheSafeParams: ctx.cacheSafeParams!,
    canUseTool: createCompactCanUseTool(),
    querySource: 'compact-v2-scored-tool',
    forkLabel: 'compact-v2-scored-tool',
    skipTranscript: true,
    skipCacheWrite: true,
  });

  const parts: string[] = [];
  for (const message of result.messages) {
    if (message.type !== 'assistant') continue;
    const content = (message as { message?: { content?: unknown } }).message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
      }
    }
  }
  return parseSafeIndexes(parts.join('\n'));
}
