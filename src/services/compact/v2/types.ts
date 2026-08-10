/**
 * Auto-compact v2 — the one shape every context-reduction mechanism takes.
 *
 * Before this, each mechanism had its own trigger, its own threshold, its own
 * return type and its own call site in query.ts. A planner cannot compare
 * options it cannot describe uniformly, so the first requirement of v2 is that
 * dedupe, stale-tool clearing, snipping, summarizing and dropping all answer
 * the same two questions: *how much would you free* and *how much would it hurt*.
 */
import type { QuerySource } from '../../../constants/querySource.js';
import type { ToolUseContext } from '../../../Tool.js';
import type { AgentId } from '../../../types/ids.js';
import type { Message } from '../../../types/message.js';
import type { CacheSafeParams } from '../../../utils/forkedAgent.js';
import type { EvictionRecord, EvictionStore } from './evictionStore.js';
import type { CompactHealth } from './health.js';
import type { ContextPressure } from './ledger.js';

export type ReducerName = 'dedupe' | 'stale-tool' | 'scored-tool' | 'snip' | 'summarize' | 'drop';

export interface CompactSessionState {
  agentId?: AgentId;
  /** Turns elapsed this session; used for eviction bookkeeping. */
  turn: number;
  /** Consecutive failed compaction attempts. */
  failures: number;
  /** Everything reclaimed this session, restorable by handle. */
  evictions: EvictionStore;
  /** Tokens restored this turn, to bound ContextRestore abuse. */
  restoredThisTurn: number;
  /** Per-agent health tracking — replaces the module-scoped singleton. */
  health: CompactHealth;
}

export interface ReduceContext {
  messages: Message[];
  model: string;
  pressure: ContextPressure;
  /** Tokens this reducer is being asked to reclaim. */
  target: number;
  querySource?: QuerySource;
  toolUseContext?: ToolUseContext;
  cacheSafeParams?: CacheSafeParams;
  state: CompactSessionState;
  /** False mid-tool-chain: reducers that would strand a tool_use must no-op. */
  atBoundary: boolean;
}

export interface ReduceOutcome {
  messages: Message[];
  tokensFreed: number;
  evicted: EvictionRecord[];
  /** Marker to yield into the transcript (e.g. a compact boundary). */
  boundary?: Message;
}

export interface Reducer {
  name: ReducerName;
  /**
   * How much context fidelity this costs, 0..1. The planner spends the
   * cheapest loss first, so these values encode the whole ordering policy.
   */
  readonly loss: number;
  /** True when applying requires an LLM call (latency + money). */
  readonly costly: boolean;
  /**
   * Upper bound on tokens this could free, without doing the work.
   * Must be fast and free of side effects — the planner calls every reducer's
   * estimate on every turn that has any deficit.
   */
  estimate(ctx: ReduceContext): number;
  apply(ctx: ReduceContext): Promise<ReduceOutcome>;
}

export function emptyOutcome(messages: Message[]): ReduceOutcome {
  return { messages, tokensFreed: 0, evicted: [] };
}
