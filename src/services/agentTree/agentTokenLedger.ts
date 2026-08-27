/**
 * Rooted token ledger — every model response is attributed to
 * (rootSessionId, agentId, parentAgentId) and appended to a durable JSONL.
 *
 * Wired at the single usage increment point (`addToTotalSessionCost` in
 * cost-tracker.ts), so both Anthropic and provider-agnostic flows land here.
 * Answers: which subagent burned how many tokens / how much money.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getSessionId } from '../../bootstrap/state.js';
import { getAgentContext } from '../../utils/agentContext.js';
import { getClewConfigHomeDir } from '../../utils/envUtils.js';

export interface AgentUsageRecord {
  ts: number;
  rootSessionId: string;
  /** 'main' when no agent context is active. */
  agentId: string;
  parentAgentId?: string;
  agentName?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}

export interface AgentUsageTotals extends AgentUsageRecord {
  calls: number;
}

function ledgerFile(rootSessionId: string): string {
  return join(ledgerHomeOverride ?? getClewConfigHomeDir(), 'agent-tree', rootSessionId, 'tokens.jsonl');
}

let ledgerHomeOverride: string | undefined;

/** Test hook — must stay in sync with agentSessionRegistry's override (same root dir). */
export function setLedgerHomeOverrideForTests(dir?: string): void {
  ledgerHomeOverride = dir;
}

/** In-process aggregate; durable truth is the JSONL. */
const live = new Map<string, AgentUsageTotals>();

function parentIdFor(agentId: string | undefined): string | undefined {
  if (!agentId || agentId === 'main') return undefined;
  try {
    // lazy import to avoid the registry → bootstrap cycle at module load
    const { getAgentTreeEntry } = require('./agentSessionRegistry.js') as typeof import('./agentSessionRegistry.js');
    return getAgentTreeEntry(agentId)?.parentId;
  } catch {
    return undefined;
  }
}

/**
 * Record one API response's usage. Call after the cost has been computed and
 * applied to session totals — this only adds attribution, never mutates STATE.
 */
export function recordAgentUsage(rec: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}): void {
  const ctx = getAgentContext();
  const rootSessionId = getSessionId();
  const agentId = ctx?.agentId ?? 'main';
  const record: AgentUsageRecord = {
    ts: Date.now(),
    rootSessionId,
    agentId,
    parentAgentId: parentIdFor(agentId),
    agentName: ctx && 'subagentName' in ctx ? ctx.subagentName : undefined,
    ...rec,
  };

  let total = live.get(agentId);
  if (!total) {
    // start from zeros — record's own values are added below exactly once
    total = {
      ...record,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUSD: 0,
    };
    live.set(agentId, total);
  }
  total.calls++;
  total.inputTokens += rec.inputTokens;
  total.outputTokens += rec.outputTokens;
  total.cacheReadInputTokens += rec.cacheReadInputTokens;
  total.cacheCreationInputTokens += rec.cacheCreationInputTokens;
  total.costUSD += rec.costUSD;

  try {
    const path = ledgerFile(rootSessionId);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    // attribution must never break a request — persistence is best-effort
  }
}

function addTotals(acc: Map<string, AgentUsageTotals>, r: AgentUsageRecord): void {
  let t = acc.get(r.agentId);
  if (!t) {
    t = {
      ...r,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUSD: 0,
    };
    acc.set(r.agentId, t);
  }
  t.calls++;
  t.inputTokens += r.inputTokens;
  t.outputTokens += r.outputTokens;
  t.cacheReadInputTokens += r.cacheReadInputTokens;
  t.cacheCreationInputTokens += r.cacheCreationInputTokens;
  t.costUSD += r.costUSD;
}

/** Rebuild per-agent totals from the durable JSONL (attach-after-restart path). */
export function loadAgentUsageTotals(rootSessionId?: string): Map<string, AgentUsageTotals> {
  const path = ledgerFile(rootSessionId ?? getSessionId());
  const acc = new Map<string, AgentUsageTotals>();
  try {
    if (!existsSync(path)) return acc;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        addTotals(acc, JSON.parse(line) as AgentUsageRecord);
      } catch {
        // skip torn last line
      }
    }
  } catch {
    return new Map();
  }
  return acc;
}

/** Live in-memory view (cheap); callers wanting cross-restart numbers use loadAgentUsageTotals. */
export function getLiveAgentUsageTotals(): Map<string, AgentUsageTotals> {
  return live;
}

/** Human-readable per-agent breakdown for the cost footer. */
export function formatAgentTokenReport(rootSessionId?: string): string {
  const totals = [...loadAgentUsageTotals(rootSessionId).values()];
  const subagents = totals.filter(t => t.agentId !== 'main');
  if (subagents.length === 0) return '';
  const lines = subagents
    .sort((a, b) => b.costUSD - a.costUSD)
    .slice(0, 12)
    .map(
      t =>
        `  ${t.agentName ?? t.agentId}: ${t.calls} calls` +
        `, ${t.inputTokens + t.cacheReadInputTokens + t.cacheCreationInputTokens} in` +
        ` (${t.cacheReadInputTokens} cached), ${t.outputTokens} out` +
        ` → $${t.costUSD.toFixed(4)}${t.parentAgentId ? ` (parent ${t.parentAgentId})` : ''}`,
    );
  return `\nBy agent:${lines.join('\n')}`;
}

export function resetAgentLedgerForTests(): void {
  live.clear();
}
