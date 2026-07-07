import { feature } from 'bun:bundle';
import { markPostCompaction } from 'src/bootstrap/state.js';
import { getSdkBetas } from '../../bootstrap/state.js';
import type { QuerySource } from '../../constants/querySource.js';
import { autoExtractFromSession } from '../../memory/compacter.js';
import type { ToolUseContext } from '../../Tool.js';
import type { Message } from '../../types/message.js';
import { getGlobalConfig } from '../../utils/config.js';
import { getContextWindowForModel } from '../../utils/context.js';
import { logForDebugging } from '../../utils/debug.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { hasExactErrorMessage } from '../../utils/errors.js';
import type { CacheSafeParams } from '../../utils/forkedAgent.js';
import { logError } from '../../utils/log.js';
import { tokenCountWithEstimation } from '../../utils/tokens.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../analytics/index.js';
import { getMaxOutputTokensForModel } from '../api/claude.js';
import { notifyCompaction } from '../api/promptCacheBreakDetection.js';
import { setLastSummarizedMessageId } from '../SessionMemory/sessionMemoryUtils.js';
import {
  type CompactionResult,
  compactConversation,
  ERROR_MESSAGE_USER_ABORT,
  type RecompactionInfo,
} from './compact.js';
import { runPostCompactCleanup } from './postCompactCleanup.js';
import { getLastRawCompactResponse, parseCompactMemories } from './prompt.js';
import { trySessionMemoryCompaction } from './sessionMemoryCompact.js';

// Reserve this many tokens for output during compaction
// Based on p99.99 of compact summary output being 17,387 tokens.
const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20_000;

// Returns the context window size minus the max output tokens for the model
export function getEffectiveContextWindowSize(model: string): number {
  const reservedTokensForSummary = Math.min(getMaxOutputTokensForModel(model), MAX_OUTPUT_TOKENS_FOR_SUMMARY);
  let contextWindow = getContextWindowForModel(model, getSdkBetas());

  const autoCompactWindow = process.env.CLEW_CODE_AUTO_COMPACT_WINDOW;
  if (autoCompactWindow) {
    const parsed = parseInt(autoCompactWindow, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      contextWindow = Math.min(contextWindow, parsed);
    }
  }

  return contextWindow - reservedTokensForSummary;
}

export type AutoCompactTrackingState = {
  compacted: boolean;
  turnCounter: number;
  // Unique ID per turn
  turnId: string;
  // Consecutive autocompact failures. Reset on success.
  // Used as a circuit breaker to stop retrying when the context is
  // irrecoverably over the limit (e.g., prompt_too_long).
  consecutiveFailures?: number;
};

// Keep enough headroom for the next API request's system prompt, tools, and
// user context. compact.ts records that this can add roughly 20-40K tokens.
export const AUTOCOMPACT_BUFFER_TOKENS = 40_000;

// Hard threshold buffer: when soft + this = hard, force-compact even mid-tool-chain.
// Only applies when CLEW_CODE_BOUNDARY_COMPACT is enabled.
export const AUTOCOMPACT_HARD_BUFFER_TOKENS = 20_000;

export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000;
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000;
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000;
export const BACKGROUND_AUTOCOMPACT_MIN_THRESHOLD_PCT = 0.65;

// ── #1 Natural-Boundary Timing ──

/**
 * Check if the conversation is at a natural boundary where compacting is safe.
 * A natural boundary means we're not mid-tool-chain: the last assistant turn
 * has no pending tool_use blocks waiting for tool_result.
 *
 * Returns true when:
 * - The last message is an assistant message with NO tool_use blocks (task done)
 * - The last message is a user message that is NOT a tool_result (new user prompt)
 *
 * Returns false when mid-chain:
 * - The last assistant message has tool_use blocks (waiting for tool results)
 * - The last user message contains tool_result blocks (tools still running)
 */
export function isAtNaturalBoundary(messages: Message[]): boolean {
  const tail = messages.at(-1);
  if (!tail) return true; // empty conversation = boundary

  if (tail.type === 'assistant') {
    const content = tail.message?.content;
    if (!Array.isArray(content)) return true; // no content blocks = done
    return !content.some((block: { type?: string }) => block.type === 'tool_use');
  }

  if (tail.type === 'user') {
    const content = tail.message?.content;
    if (!Array.isArray(content)) return true; // string content = user typed text
    // If the user message contains tool_result blocks, we're mid-chain
    return !content.some((block: { type?: string }) => block.type === 'tool_result');
  }

  return true; // system / progress / other = boundary
}

/**
 * Check if boundary-aware compact is enabled via env or settings.
 */
export function isBoundaryCompactEnabled(): boolean {
  if (isEnvTruthy(process.env.CLEW_CODE_BOUNDARY_COMPACT)) return true;
  const userConfig = getGlobalConfig();
  return (userConfig as Record<string, unknown>)?.boundaryCompact === true;
}

// ── #2 Adaptive Threshold ──

/**
 * Estimate compressibility ratio (0..1) of a session.
 * Tool_result tokens / total tokens. Higher = more compressible.
 */
export function estimateCompressibility(messages: Message[]): number {
  let totalTokens = 0;
  let toolResultTokens = 0;

  for (const message of messages) {
    if (message.type !== 'user' && message.type !== 'assistant') continue;
    const content = message.message?.content;
    if (!Array.isArray(content)) {
      if (typeof content === 'string') {
        const t = Math.ceil(content.length / 4);
        totalTokens += t;
      }
      continue;
    }
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        const t = Math.ceil(block.text.length / 4);
        totalTokens += t;
      } else if (block.type === 'tool_result') {
        const blockContent = block.content;
        let t = 0;
        if (typeof blockContent === 'string') {
          t = Math.ceil(blockContent.length / 4);
        } else if (Array.isArray(blockContent)) {
          for (const item of blockContent) {
            if (item.type === 'text') t += Math.ceil(item.text.length / 4);
            else t += 2000; // image/document
          }
        }
        totalTokens += t;
        toolResultTokens += t;
      } else if (block.type === 'tool_use') {
        totalTokens += Math.ceil((block.name?.length ?? 0) / 4);
      } else if (block.type === 'image' || block.type === 'document') {
        totalTokens += 2000;
      }
    }
  }

  if (totalTokens === 0) return 0;
  return Math.min(1, toolResultTokens / totalTokens);
}

// ── #3 Compact Quality Feedback Loop (measure-only) ──

type CompactRegretState = {
  /** Tool signatures (toolName:key) that existed pre-compact and were dropped */
  droppedSignatures: Set<string>;
  /** Turns since last compact */
  turnsSinceCompact: number;
  /** Regret count for current session */
  regretCount: number;
  /** Whether we've logged this session's baseline */
  hasLoggedBaseline: boolean;
};

/** Module-level regret state — reset on each new compact. */
let regretState: CompactRegretState = {
  droppedSignatures: new Set(),
  turnsSinceCompact: 0,
  regretCount: 0,
  hasLoggedBaseline: false,
};

export function getCompactRegretState(): Readonly<CompactRegretState> {
  return regretState;
}

/**
 * Collect tool_use signatures from a set of messages.
 * Used to snapshot the pre-compact set and the surviving (kept) set; the
 * dropped set is the difference (see computeDroppedToolSignatures).
 */
export function collectToolSignatures(messages: Message[]): Set<string> {
  const sigs = new Set<string>();
  for (const m of messages) {
    if (m?.type !== 'assistant') continue;
    const content = m.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_use') {
        const key = compactToolSignature(block);
        if (key) sigs.add(key);
      }
    }
  }
  return sigs;
}

/**
 * Signatures present before compaction but absent from the kept messages —
 * i.e. the tool calls whose context compaction actually dropped. Subtracting
 * the kept set matters for session-memory compaction, which retains a tail of
 * recent messages; counting those as dropped would produce false regret.
 */
export function computeDroppedToolSignatures(allMessages: Message[], keptMessages: Message[]): Set<string> {
  const kept = collectToolSignatures(keptMessages);
  const dropped = new Set<string>();
  for (const sig of collectToolSignatures(allMessages)) {
    if (!kept.has(sig)) dropped.add(sig);
  }
  return dropped;
}

function compactToolSignature(block: { name?: string; input?: Record<string, unknown> }): string | null {
  if (!block.name) return null;
  // Key by first meaningful input param (usually path, pattern, command)
  const input = block.input ?? {};
  const keyParam = input.file_path ?? input.pattern ?? input.command ?? input.url ?? '';
  return `${block.name}:${String(keyParam).slice(0, 120)}`;
}

/**
 * Check if a tool call matches a dropped signature (regret signal).
 * Called on each tool_use after compaction.
 */
export function checkCompactRegret(
  toolName: string,
  input: Record<string, unknown> | undefined,
): boolean {
  // Only count re-references inside the post-compact window. Outside it, a
  // repeated tool call is ordinary work, not regret.
  if (!isWithinRegretWindow()) return false;
  const candidate = compactToolSignature({ name: toolName, input: input ?? {} });
  if (!candidate) return false;
  if (!regretState.droppedSignatures.has(candidate)) return false;
  // Consume the signature so the same drop isn't counted repeatedly.
  regretState.droppedSignatures.delete(candidate);
  return true;
}

/**
 * Reset regret state for a new compact cycle.
 */
export function resetCompactRegretState(droppedSignatures: Set<string>): void {
  regretState = {
    droppedSignatures,
    turnsSinceCompact: 0,
    regretCount: 0,
    hasLoggedBaseline: regretState.hasLoggedBaseline,
  };
}

/**
 * How many turns after a compact we keep watching for regret. Past this window
 * a re-reference is normal working, not "the compact dropped something I still
 * needed", so it shouldn't count.
 */
export const COMPACT_REGRET_WINDOW_TURNS = 8;

/**
 * Increment turn counter post-compact. Call once per query loop iteration so
 * the regret window (COMPACT_REGRET_WINDOW_TURNS) can expire.
 */
export function tickCompactRegret(): void {
  regretState.turnsSinceCompact++;
}

/** True while still inside the post-compact regret observation window. */
export function isWithinRegretWindow(): boolean {
  return regretState.droppedSignatures.size > 0 && regretState.turnsSinceCompact <= COMPACT_REGRET_WINDOW_TURNS;
}

/**
 * Non-reversible hash so analytics never receives raw file paths / commands.
 * djb2 — collisions are irrelevant here, we only need a stable opaque bucket.
 */
function hashRegretKey(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = (h * 33) ^ key.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * Log a regret event when detected. Only the tool name (a safe enum-like
 * identifier) and an opaque hash of the tool signature are logged — never the
 * raw file path / command, which would be user data. The signature is built
 * the same way as the match key so the hash is stable.
 */
export function logCompactRegret(toolName: string, input: Record<string, unknown> | undefined): void {
  regretState.regretCount++;
  const sig = compactToolSignature({ name: toolName, input: input ?? {} }) ?? toolName;
  logEvent('compact_regret_detected', {
    toolName: toolName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    keyHash: hashRegretKey(sig) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    turnsSinceCompact: regretState.turnsSinceCompact,
    totalRegrets: regretState.regretCount,
  });
}

// ── End Feedback Loop ──

// Stop trying autocompact after this many consecutive failures.
// BQ 2026-03-10: 1,279 sessions had 50+ consecutive failures (up to 3,272)
// in a single session, wasting ~250K API calls/day globally.
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3;

// Minimum turns to wait after a successful compact before allowing another.
// Prevents re-triggering on every turn when the post-compact context is
// still near the auto-compact threshold.
const MIN_TURNS_BETWEEN_COMPACTS = 3;

type BackgroundAutoCompactJob = {
  model: string;
  agentId?: string;
  tailUuid: string;
  promise: Promise<CompactionResult>;
};

export type BackgroundAutoCompactStatus = {
  running: boolean;
  tokenCount?: number;
  threshold?: number;
  startedAt?: number;
  tailUuid?: string;
};

let backgroundAutoCompactJob: BackgroundAutoCompactJob | undefined;
let backgroundAutoCompactStatus: BackgroundAutoCompactStatus = { running: false };

export function getBackgroundAutoCompactStatus(): BackgroundAutoCompactStatus {
  return backgroundAutoCompactStatus;
}

// ── Adaptive threshold config ──
const MIN_ADAPTIVE_BUFFER = 25_000;
const MAX_ADAPTIVE_BUFFER = 55_000;
// GrowthBook feature flag for adaptive threshold tuning
const ADAPTIVE_THRESHOLD_FEATURE = 'tengu_adaptive_compact_threshold';

export function getAutoCompactThreshold(model: string, messages?: Message[]): number {
  const effectiveContextWindow = getEffectiveContextWindowSize(model);

  let baseBuffer = AUTOCOMPACT_BUFFER_TOKENS;

  // #2 Adaptive threshold: adjust buffer based on session compressibility
  if (messages && messages.length > 0) {
    // Gate via GrowthBook for remote tuning
    const adaptiveConfig = getFeatureValue_CACHED_MAY_BE_STALE<{
      enabled: boolean;
      minBuffer?: number;
      maxBuffer?: number;
    } | null>(ADAPTIVE_THRESHOLD_FEATURE, null);

    if (adaptiveConfig?.enabled) {
      const ratio = estimateCompressibility(messages);
      // High compressibility (tool-heavy) → smaller buffer → grow threshold later
      // Low compressibility (chat-only) → larger buffer → compact sooner
      // Interpolate: ratio 0 → maxBuffer, ratio 1 → minBuffer
      const minB = adaptiveConfig.minBuffer ?? MIN_ADAPTIVE_BUFFER;
      const maxB = adaptiveConfig.maxBuffer ?? MAX_ADAPTIVE_BUFFER;
      baseBuffer = Math.round(maxB - ratio * (maxB - minB));
      // Clamp to safe range
      baseBuffer = Math.max(minB, Math.min(maxB, baseBuffer));
    }
  }

  const autocompactThreshold = effectiveContextWindow - baseBuffer;

  // Override for easier testing of autocompact
  const envPercent = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
  if (envPercent) {
    const parsed = parseFloat(envPercent);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 100) {
      const percentageThreshold = Math.floor(effectiveContextWindow * (parsed / 100));
      return Math.min(percentageThreshold, autocompactThreshold);
    }
  }

  return autocompactThreshold;
}

export function getBackgroundAutoCompactThreshold(model: string): number {
  const autoCompactThreshold = getAutoCompactThreshold(model);
  return Math.max(
    Math.floor(autoCompactThreshold * BACKGROUND_AUTOCOMPACT_MIN_THRESHOLD_PCT),
    autoCompactThreshold - WARNING_THRESHOLD_BUFFER_TOKENS,
  );
}

export function calculateTokenWarningState(
  tokenUsage: number,
  model: string,
  // Pass messages to honor the #2 adaptive threshold. Omitting them (e.g. UI
  // warning readouts that only know the token count) falls back to the static
  // buffer — same as before adaptive existed.
  messages?: Message[],
): {
  percentLeft: number;
  isAboveWarningThreshold: boolean;
  isAboveErrorThreshold: boolean;
  isAboveAutoCompactThreshold: boolean;
  isAtBlockingLimit: boolean;
} {
  const autoCompactThreshold = getAutoCompactThreshold(model, messages);
  const threshold = isAutoCompactEnabled() ? autoCompactThreshold : getEffectiveContextWindowSize(model);

  const percentLeft = Math.max(0, Math.round(((threshold - tokenUsage) / threshold) * 100));

  const warningThreshold = threshold - WARNING_THRESHOLD_BUFFER_TOKENS;
  const errorThreshold = threshold - ERROR_THRESHOLD_BUFFER_TOKENS;

  const isAboveWarningThreshold = tokenUsage >= warningThreshold;
  const isAboveErrorThreshold = tokenUsage >= errorThreshold;

  const isAboveAutoCompactThreshold = isAutoCompactEnabled() && tokenUsage >= autoCompactThreshold;

  const actualContextWindow = getEffectiveContextWindowSize(model);
  const defaultBlockingLimit = actualContextWindow - MANUAL_COMPACT_BUFFER_TOKENS;

  // Allow override for testing
  const blockingLimitOverride = process.env.CLEW_CODE_BLOCKING_LIMIT_OVERRIDE;
  const parsedOverride = blockingLimitOverride ? parseInt(blockingLimitOverride, 10) : NaN;
  const blockingLimit = !Number.isNaN(parsedOverride) && parsedOverride > 0 ? parsedOverride : defaultBlockingLimit;

  const isAtBlockingLimit = tokenUsage >= blockingLimit;

  return {
    percentLeft,
    isAboveWarningThreshold,
    isAboveErrorThreshold,
    isAboveAutoCompactThreshold,
    isAtBlockingLimit,
  };
}

export function isAutoCompactEnabled(): boolean {
  if (isEnvTruthy(process.env.DISABLE_COMPACT)) {
    return false;
  }
  // Allow disabling just auto-compact (keeps manual /compact working)
  if (isEnvTruthy(process.env.DISABLE_AUTO_COMPACT)) {
    return false;
  }
  // Check if user has disabled auto-compact in their settings
  const userConfig = getGlobalConfig();
  return userConfig.autoCompactEnabled;
}

/**
 * Get the hard (force-compact) threshold when boundary-compact is enabled.
 * Built on the same (adaptive-aware) soft threshold + a fixed buffer so the
 * soft/hard gap is constant regardless of the #2 adaptive adjustment.
 */
export function getAutoCompactHardThreshold(model: string, messages?: Message[]): number {
  return getAutoCompactThreshold(model, messages) + AUTOCOMPACT_HARD_BUFFER_TOKENS;
}

export async function shouldAutoCompact(
  messages: Message[],
  model: string,
  querySource?: QuerySource,
  // Snip removes messages but the surviving assistant's usage still reflects
  // pre-snip context, so tokenCountWithEstimation can't see the savings.
  // Subtract the rough-delta that snip already computed.
  snipTokensFreed = 0,
): Promise<boolean> {
  // Recursion guards. session_memory and compact are forked agents that
  // would deadlock.
  if (querySource === 'session_memory' || querySource === 'compact') {
    return false;
  }
  // marble_origami is the ctx-agent — if ITS context blows up and
  // autocompact fires, runPostCompactCleanup calls resetContextCollapse()
  // which destroys the MAIN thread's committed log (module-level state
  // shared across forks). Inside feature() so the string DCEs from
  // external builds (it's in excluded-strings.txt).
  if (feature('CONTEXT_COLLAPSE')) {
    if (querySource === 'marble_origami') {
      return false;
    }
  }

  if (!isAutoCompactEnabled()) {
    return false;
  }

  // Reactive-only mode: suppress proactive autocompact, let reactive compact
  // catch the API's prompt-too-long. feature() wrapper keeps the flag string
  // out of external builds (REACTIVE_COMPACT is ant-only).
  // Note: returning false here also means autoCompactIfNeeded never reaches
  // trySessionMemoryCompaction in the query loop — the /compact call site
  // still tries session memory first. Revisit if reactive-only graduates.
  if (feature('REACTIVE_COMPACT')) {
    if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_raccoon', false)) {
      return false;
    }
  }

  // Context-collapse mode: same suppression. Collapse IS the context
  // management system when it's on — the 90% commit / 95% blocking-spawn
  // flow owns the headroom problem. Autocompact firing at effective-13k
  // (~93% of effective) sits right between collapse's commit-start (90%)
  // and blocking (95%), so it would race collapse and usually win, nuking
  // granular context that collapse was about to save. Gating here rather
  // than in isAutoCompactEnabled() keeps reactiveCompact alive as the 413
  // fallback (it consults isAutoCompactEnabled directly) and leaves
  // sessionMemory + manual /compact working.
  //
  // Consult isContextCollapseEnabled (not the raw gate) so the
  // CLAUDE_CONTEXT_COLLAPSE env override is honored here too. require()
  // inside the block breaks the init-time cycle (this file exports
  // getEffectiveContextWindowSize which collapse's index imports).
  if (feature('CONTEXT_COLLAPSE')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { isContextCollapseEnabled } =
      require('../contextCollapse/index.js') as typeof import('../contextCollapse/index.js');
    /* eslint-enable @typescript-eslint/no-require-imports */
    if (isContextCollapseEnabled()) {
      return false;
    }
  }

  const tokenCount = tokenCountWithEstimation(messages) - snipTokensFreed;
  const threshold = getAutoCompactThreshold(model, messages);
  const effectiveWindow = getEffectiveContextWindowSize(model);

  logForDebugging(
    `autocompact: tokens=${tokenCount} threshold=${threshold} effectiveWindow=${effectiveWindow}${snipTokensFreed > 0 ? ` snipFreed=${snipTokensFreed}` : ''}`,
  );

  const { isAboveAutoCompactThreshold } = calculateTokenWarningState(tokenCount, model, messages);

  // #1 Natural-boundary timing: if boundary-compact is enabled and we're in
  // the soft zone (above threshold but below hard threshold), wait for a
  // natural boundary instead of compacting mid-tool-chain.
  if (isAboveAutoCompactThreshold && isBoundaryCompactEnabled()) {
    const hardThreshold = getAutoCompactHardThreshold(model, messages);
    if (tokenCount >= hardThreshold) {
      // Hard threshold exceeded — force compact even mid-chain
      logEvent('boundary_compact_forced_at_hard', {
        tokenCount,
        softThreshold: threshold,
        hardThreshold,
        querySource: (querySource ?? 'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      return true;
    }
    // Soft zone: defer if not at natural boundary
    if (!isAtNaturalBoundary(messages)) {
      logForDebugging(
        `autocompact: deferred — not at natural boundary (tokens=${tokenCount}, soft=${threshold}, hard=${hardThreshold})`,
      );
      logEvent('boundary_compact_deferred', {
        tokenCount,
        softThreshold: threshold,
        hardThreshold,
        querySource: (querySource ?? 'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      return false;
    }
  }

  return isAboveAutoCompactThreshold;
}

export async function shouldStartBackgroundAutoCompact(
  messages: Message[],
  model: string,
  querySource?: QuerySource,
  snipTokensFreed = 0,
): Promise<boolean> {
  if (await shouldAutoCompact(messages, model, querySource, snipTokensFreed)) {
    return false;
  }
  if (querySource === 'session_memory' || querySource === 'compact') {
    return false;
  }
  if (!isAutoCompactEnabled()) {
    return false;
  }
  if (feature('REACTIVE_COMPACT')) {
    if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_raccoon', false)) {
      return false;
    }
  }
  if (feature('CONTEXT_COLLAPSE')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { isContextCollapseEnabled } =
      require('../contextCollapse/index.js') as typeof import('../contextCollapse/index.js');
    /* eslint-enable @typescript-eslint/no-require-imports */
    if (isContextCollapseEnabled()) {
      return false;
    }
  }

  const tokenCount = tokenCountWithEstimation(messages) - snipTokensFreed;

  // #1 Natural-boundary: if we deferred compact due to boundary (soft zone),
  // start background pre-compaction so the result is ready when boundary hits.
  if (isBoundaryCompactEnabled()) {
    const softThreshold = getAutoCompactThreshold(model, messages);
    const hardThreshold = getAutoCompactHardThreshold(model, messages);
    if (tokenCount >= softThreshold && tokenCount < hardThreshold && !isAtNaturalBoundary(messages)) {
      return true;
    }
  }

  // Normal background threshold check
  return tokenCount >= getBackgroundAutoCompactThreshold(model);
}

function getMessageUuid(message: Message | undefined): string | undefined {
  return typeof message?.uuid === 'string' ? message.uuid : undefined;
}

function isSameBackgroundScope(job: BackgroundAutoCompactJob, model: string, agentId?: string): boolean {
  return job.model === model && job.agentId === agentId;
}

function findMessageIndexByUuid(messages: Message[], uuid: string): number {
  return messages.findIndex(message => getMessageUuid(message) === uuid);
}

function hasCompactBoundaryAfter(messages: Message[], index: number): boolean {
  return messages.slice(index + 1).some(message => message.type === 'system' && message.subtype === 'compact_boundary');
}

export function mergeBackgroundAutoCompactDelta(
  result: CompactionResult,
  currentMessages: Message[],
  snapshotTailUuid: string,
): CompactionResult | undefined {
  const tailIndex = findMessageIndexByUuid(currentMessages, snapshotTailUuid);
  if (tailIndex === -1 || hasCompactBoundaryAfter(currentMessages, tailIndex)) {
    return undefined;
  }

  const deltaMessages = currentMessages.slice(tailIndex + 1).filter(message => message.type !== 'progress');
  if (deltaMessages.length === 0) {
    return result;
  }

  const deltaTailUuid = getMessageUuid(deltaMessages.at(-1));
  const boundaryWithMetadata = result.boundaryMarker as typeof result.boundaryMarker & {
    compactMetadata?: {
      preservedSegment?: Record<string, unknown>;
      [key: string]: unknown;
    };
  };
  const preservedSegment = boundaryWithMetadata.compactMetadata?.preservedSegment;
  const boundaryMarker =
    deltaTailUuid && preservedSegment
      ? {
          ...result.boundaryMarker,
          compactMetadata: {
            ...boundaryWithMetadata.compactMetadata,
            preservedSegment: {
              ...preservedSegment,
              tailUuid: deltaTailUuid,
            },
          },
        }
      : result.boundaryMarker;

  return {
    ...result,
    boundaryMarker,
    messagesToKeep: [...(result.messagesToKeep ?? []), ...deltaMessages],
  };
}

function startBackgroundAutoCompact(
  messages: Message[],
  toolUseContext: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  recompactionInfo: RecompactionInfo,
  tokenCount: number,
): void {
  const model = toolUseContext.options.mainLoopModel;
  const tailUuid = getMessageUuid(messages.at(-1));
  if (!tailUuid) {
    return;
  }
  if (
    backgroundAutoCompactJob &&
    isSameBackgroundScope(backgroundAutoCompactJob, model, toolUseContext.agentId) &&
    findMessageIndexByUuid(messages, backgroundAutoCompactJob.tailUuid) !== -1
  ) {
    return;
  }

  const snapshot = [...messages];
  backgroundAutoCompactStatus = {
    running: true,
    tokenCount,
    threshold: getBackgroundAutoCompactThreshold(model),
    startedAt: Date.now(),
    tailUuid,
  };
  backgroundAutoCompactJob = {
    model,
    agentId: toolUseContext.agentId,
    tailUuid,
    promise: compactConversation(
      snapshot,
      toolUseContext,
      {
        ...cacheSafeParams,
        forkContextMessages: [...(cacheSafeParams.forkContextMessages ?? snapshot)],
      },
      true,
      undefined,
      true,
      recompactionInfo,
    ),
  };
  backgroundAutoCompactJob.promise.catch(() => {
    if (backgroundAutoCompactJob?.tailUuid === tailUuid) {
      backgroundAutoCompactJob = undefined;
      backgroundAutoCompactStatus = { running: false };
    }
  });
}

async function takeBackgroundAutoCompactResult(
  messages: Message[],
  model: string,
  agentId?: string,
): Promise<CompactionResult | undefined> {
  const job = backgroundAutoCompactJob;
  if (!job || !isSameBackgroundScope(job, model, agentId) || findMessageIndexByUuid(messages, job.tailUuid) === -1) {
    return undefined;
  }

  backgroundAutoCompactJob = undefined;
  try {
    const result = await job.promise;
    return mergeBackgroundAutoCompactDelta(result, messages, job.tailUuid);
  } finally {
    backgroundAutoCompactStatus = { running: false };
  }
}

export async function autoCompactIfNeeded(
  messages: Message[],
  toolUseContext: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  querySource?: QuerySource,
  tracking?: AutoCompactTrackingState,
  snipTokensFreed?: number,
): Promise<{
  wasCompacted: boolean;
  compactionResult?: CompactionResult;
  consecutiveFailures?: number;
}> {
  if (isEnvTruthy(process.env.DISABLE_COMPACT)) {
    return { wasCompacted: false };
  }

  // Circuit breaker: stop retrying after N consecutive failures.
  // Without this, sessions where context is irrecoverably over the limit
  // hammer the API with doomed compaction attempts on every turn.
  if (
    tracking?.consecutiveFailures !== undefined &&
    tracking.consecutiveFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES
  ) {
    return { wasCompacted: false };
  }

  const model = toolUseContext.options.mainLoopModel;
  const recompactionInfo: RecompactionInfo = {
    isRecompactionInChain: tracking?.compacted === true,
    turnsSincePreviousCompact: tracking?.turnCounter ?? -1,
    previousCompactTurnId: tracking?.turnId,
    autoCompactThreshold: getAutoCompactThreshold(model),
    querySource,
  };

  const shouldCompact = await shouldAutoCompact(messages, model, querySource, snipTokensFreed);

  if (!shouldCompact) {
    if (await shouldStartBackgroundAutoCompact(messages, model, querySource, snipTokensFreed)) {
      startBackgroundAutoCompact(
        messages,
        toolUseContext,
        cacheSafeParams,
        recompactionInfo,
        tokenCountWithEstimation(messages) - (snipTokensFreed ?? 0),
      );
    }
    return { wasCompacted: false };
  }

  // Cooldown: skip autocompact if we recently compacted. Without this, the
  // post-compact context can still be near the threshold, triggering another
  // compact on the very next turn in an endless loop.
  if (tracking?.compacted && tracking.turnCounter < MIN_TURNS_BETWEEN_COMPACTS) {
    logForDebugging(
      `autocompact: cooldown — skipping, only ${tracking.turnCounter}/${MIN_TURNS_BETWEEN_COMPACTS} turns since last compact`,
    );
    return { wasCompacted: false };
  }

  // #3 Feedback loop (measure-only): snapshot tool_use signatures pre-compact
  // so the dropped set can be computed against each path's kept messages.
  const preCompactMessages = messages;

  // EXPERIMENT: Try session memory compaction first
  const sessionMemoryResult = await trySessionMemoryCompaction(
    messages,
    toolUseContext.agentId,
    recompactionInfo.autoCompactThreshold,
  );
  if (sessionMemoryResult) {
    // Reset lastSummarizedMessageId since session memory compaction prunes messages
    // and the old message UUID will no longer exist after the REPL replaces messages
    setLastSummarizedMessageId(undefined);
    runPostCompactCleanup(querySource);
    // Reset cache read baseline so the post-compact drop isn't flagged as a
    // break. compactConversation does this internally; SM-compact doesn't.
    // BQ 2026-03-01: missing this made 20% of tengu_prompt_cache_break events
    // false positives (systemPromptChanged=true, timeSinceLastAssistantMsg=-1).
    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      notifyCompaction(querySource ?? 'compact', toolUseContext.agentId);
    }
    markPostCompaction();
    const raw1 = getLastRawCompactResponse();
    const mem1 = raw1 ? parseCompactMemories(raw1) : undefined;
    autoExtractFromSession(mem1).catch(() => {
      // Best-effort memory extraction must not block compaction.
    });
    // #3 Feedback loop: init regret tracking with dropped signatures
    // (subtract the tail SM-compact keeps so kept tool calls aren't counted).
    const droppedSM = computeDroppedToolSignatures(
      preCompactMessages,
      sessionMemoryResult.messagesToKeep ?? [],
    );
    resetCompactRegretState(droppedSM);
    if (!regretState.hasLoggedBaseline) {
      logEvent('compact_regret_baseline', {
        droppedSignatures: droppedSM.size,
        compactionType: 'session_memory' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      regretState.hasLoggedBaseline = true;
    }
    return {
      wasCompacted: true,
      compactionResult: sessionMemoryResult,
    };
  }

  try {
    const compactionResult =
      (await takeBackgroundAutoCompactResult(messages, model, toolUseContext.agentId)) ??
      (await compactConversation(
        messages,
        toolUseContext,
        cacheSafeParams,
        true, // Suppress user questions for autocompact
        undefined, // No custom instructions for autocompact
        true, // isAutoCompact
        recompactionInfo,
      ));

    // Reset lastSummarizedMessageId since legacy compaction replaces all messages
    // and the old message UUID will no longer exist in the new messages array
    setLastSummarizedMessageId(undefined);
    runPostCompactCleanup(querySource);
    const raw2 = getLastRawCompactResponse();
    const mem2 = raw2 ? parseCompactMemories(raw2) : undefined;
    autoExtractFromSession(mem2).catch(() => {
      // Best-effort memory extraction must not block compaction.
    });

    // #3 Feedback loop: init regret tracking with dropped signatures
    // (subtract messagesToKeep so surviving tool calls aren't counted).
    const kept = compactionResult.messagesToKeep ?? [];
    const droppedSigs = computeDroppedToolSignatures(preCompactMessages, kept);
    resetCompactRegretState(droppedSigs);
    if (!regretState.hasLoggedBaseline) {
      logEvent('compact_regret_baseline', {
        droppedSignatures: droppedSigs.size,
        keptSignatures: collectToolSignatures(kept).size,
        compactionType: 'full' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      regretState.hasLoggedBaseline = true;
    }

    return {
      wasCompacted: true,
      compactionResult,
      // Reset failure count on success
      consecutiveFailures: 0,
    };
  } catch (error) {
    if (!hasExactErrorMessage(error, ERROR_MESSAGE_USER_ABORT)) {
      logError(error);
    }
    // Increment consecutive failure count for circuit breaker.
    // The caller threads this through autoCompactTracking so the
    // next query loop iteration can skip futile retry attempts.
    const prevFailures = tracking?.consecutiveFailures ?? 0;
    const nextFailures = prevFailures + 1;
    if (nextFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES) {
      logForDebugging(
        `autocompact: circuit breaker tripped after ${nextFailures} consecutive failures — skipping future attempts this session`,
        { level: 'warn' },
      );
    }
    return { wasCompacted: false, consecutiveFailures: nextFailures };
  }
}
