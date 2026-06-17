import type { BetaUsage as Usage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import chalk from 'chalk';
import {
  addToTotalCostState,
  addToTotalLinesChanged,
  getCostCounter,
  getModelUsage,
  getSdkBetas,
  getSessionId,
  getTokenCounter,
  getTotalAPIDuration,
  getTotalAPIDurationWithoutRetries,
  getTotalCacheCreationInputTokens,
  getTotalCacheReadInputTokens,
  getTotalCostUSD,
  getTotalDuration,
  getTotalInputTokens,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getTotalOutputTokens,
  getTotalToolDuration,
  getTotalWebSearchRequests,
  getUsageForModel,
  hasUnknownModelCost,
  resetCostState,
  resetStateForTests,
  setCostStateForRestore,
  setHasUnknownModelCost,
} from './bootstrap/state.js';
import type { ModelUsage } from './entrypoints/agentSdkTypes.js';
import { ProviderManager } from './services/ai/ProviderManager.js';
import type { ProviderUsage } from './services/ai/usageTypes.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from './services/analytics/index.js';
import { getAdvisorUsage } from './utils/advisor.js';
import { getCurrentProjectConfig, saveCurrentProjectConfig } from './utils/config.js';
import { getContextWindowForModel, getModelMaxOutputTokens } from './utils/context.js';
import { isFastModeEnabled } from './utils/fastMode.js';
import { formatDuration, formatNumber } from './utils/format.js';
import type { FpsMetrics } from './utils/fpsTracker.js';
import { getCanonicalName } from './utils/model/model.js';
import { calculateUSDCost } from './utils/modelCost.js';

export {
  addToTotalLinesChanged,
  formatCost,
  getModelUsage,
  getTotalAPIDuration,
  getTotalAPIDurationWithoutRetries,
  getTotalCacheCreationInputTokens,
  getTotalCacheReadInputTokens,
  getTotalCostUSD as getTotalCost,
  getTotalDuration,
  getTotalInputTokens,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getTotalOutputTokens,
  getTotalWebSearchRequests,
  getUsageForModel,
  hasUnknownModelCost,
  resetCostState,
  resetStateForTests,
  setHasUnknownModelCost,
};

type StoredCostState = {
  totalCostUSD: number;
  totalAPIDuration: number;
  totalAPIDurationWithoutRetries: number;
  totalToolDuration: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  lastDuration: number | undefined;
  modelUsage: { [modelName: string]: ModelUsage } | undefined;
};

/**
 * Gets stored cost state from project config for a specific session.
 * Returns the cost data if the session ID matches, or undefined otherwise.
 * Use this to read costs BEFORE overwriting the config with saveCurrentSessionCosts().
 */
export function getStoredSessionCosts(sessionId: string): StoredCostState | undefined {
  const projectConfig = getCurrentProjectConfig();

  // Only return costs if this is the same session that was last saved
  if (projectConfig.lastSessionId !== sessionId) {
    return undefined;
  }

  // Build model usage with context windows
  let modelUsage: { [modelName: string]: ModelUsage } | undefined;
  if (projectConfig.lastModelUsage) {
    modelUsage = Object.fromEntries(
      Object.entries(projectConfig.lastModelUsage).map(([model, usage]) => [
        model,
        {
          ...usage,
          contextWindow: getContextWindowForModel(model, getSdkBetas()),
          maxOutputTokens: getModelMaxOutputTokens(model).default,
        },
      ]),
    );
  }

  return {
    totalCostUSD: projectConfig.lastCost ?? 0,
    totalAPIDuration: projectConfig.lastAPIDuration ?? 0,
    totalAPIDurationWithoutRetries: projectConfig.lastAPIDurationWithoutRetries ?? 0,
    totalToolDuration: projectConfig.lastToolDuration ?? 0,
    totalLinesAdded: projectConfig.lastLinesAdded ?? 0,
    totalLinesRemoved: projectConfig.lastLinesRemoved ?? 0,
    lastDuration: projectConfig.lastDuration,
    modelUsage,
  };
}

/**
 * Restores cost state from project config when resuming a session.
 * Only restores if the session ID matches the last saved session.
 * @returns true if cost state was restored, false otherwise
 */
export function restoreCostStateForSession(sessionId: string): boolean {
  const data = getStoredSessionCosts(sessionId);
  if (!data) {
    return false;
  }
  setCostStateForRestore(data);
  return true;
}

/**
 * Saves the current session's costs to project config.
 * Call this before switching sessions to avoid losing accumulated costs.
 */
export function saveCurrentSessionCosts(fpsMetrics?: FpsMetrics): void {
  saveCurrentProjectConfig(current => ({
    ...current,
    lastCost: getTotalCostUSD(),
    lastAPIDuration: getTotalAPIDuration(),
    lastAPIDurationWithoutRetries: getTotalAPIDurationWithoutRetries(),
    lastToolDuration: getTotalToolDuration(),
    lastDuration: getTotalDuration(),
    lastLinesAdded: getTotalLinesAdded(),
    lastLinesRemoved: getTotalLinesRemoved(),
    lastTotalInputTokens: getTotalInputTokens(),
    lastTotalOutputTokens: getTotalOutputTokens(),
    lastTotalCacheCreationInputTokens: getTotalCacheCreationInputTokens(),
    lastTotalCacheReadInputTokens: getTotalCacheReadInputTokens(),
    lastTotalWebSearchRequests: getTotalWebSearchRequests(),
    lastFpsAverage: fpsMetrics?.averageFps,
    lastFpsLow1Pct: fpsMetrics?.low1PctFps,
    lastModelUsage: Object.fromEntries(
      Object.entries(getModelUsage()).map(([model, usage]) => [
        model,
        {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadInputTokens: usage.cacheReadInputTokens,
          cacheCreationInputTokens: usage.cacheCreationInputTokens,
          webSearchRequests: usage.webSearchRequests,
          costUSD: usage.costUSD,
        },
      ]),
    ),
    lastSessionId: getSessionId(),
  }));
}

function formatCost(cost: number, maxDecimalPlaces: number = 4): string {
  return `$${cost > 0.5 ? round(cost, 100).toFixed(2) : cost.toFixed(maxDecimalPlaces)}`;
}

function formatModelUsage(): string {
  const modelUsageMap = getModelUsage();
  if (Object.keys(modelUsageMap).length === 0) {
    return 'Usage:                 0 input, 0 output, 0 cache read, 0 cache write';
  }

  // Accumulate usage by short name
  const usageByShortName: { [shortName: string]: ModelUsage } = {};
  for (const [model, usage] of Object.entries(modelUsageMap)) {
    const shortName = getCanonicalName(model);
    if (!usageByShortName[shortName]) {
      usageByShortName[shortName] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        costUSD: 0,
        contextWindow: 0,
        maxOutputTokens: 0,
      };
    }
    const accumulated = usageByShortName[shortName];
    accumulated.inputTokens += usage.inputTokens;
    accumulated.outputTokens += usage.outputTokens;
    accumulated.cacheReadInputTokens += usage.cacheReadInputTokens;
    accumulated.cacheCreationInputTokens += usage.cacheCreationInputTokens;
    accumulated.webSearchRequests += usage.webSearchRequests;
    accumulated.costUSD += usage.costUSD;
  }

  let result = 'Usage by model:';
  for (const [shortName, usage] of Object.entries(usageByShortName)) {
    const usageString =
      `  ${formatNumber(usage.inputTokens)} input, ` +
      `${formatNumber(usage.outputTokens)} output, ` +
      `${formatNumber(usage.cacheReadInputTokens)} cache read, ` +
      `${formatNumber(usage.cacheCreationInputTokens)} cache write` +
      (usage.webSearchRequests > 0 ? `, ${formatNumber(usage.webSearchRequests)} web search` : '') +
      ` (${formatCost(usage.costUSD)})`;
    result += `\n${`${shortName}:`.padStart(21)}${usageString}`;
  }
  return result;
}

export function formatTotalCost(): string {
  const costDisplay =
    formatCost(getTotalCostUSD()) +
    (hasUnknownModelCost() ? ' (costs may be inaccurate due to usage of unknown models)' : '');

  const modelUsageDisplay = formatModelUsage();

  return chalk.dim(
    `Total cost:            ${costDisplay}\n` +
      `Total duration (API):  ${formatDuration(getTotalAPIDuration())}
Total duration (wall): ${formatDuration(getTotalDuration())}
Total code changes:    ${getTotalLinesAdded()} ${getTotalLinesAdded() === 1 ? 'line' : 'lines'} added, ${getTotalLinesRemoved()} ${getTotalLinesRemoved() === 1 ? 'line' : 'lines'} removed
${modelUsageDisplay}`,
  );
}

function round(number: number, precision: number): number {
  return Math.round(number * precision) / precision;
}

/**
 * @[MULTI_PROVIDER] Track model usage from an Anthropic Usage object.
 * For non-Anthropic providers, use the ProviderUsage overload.
 */
function addToTotalModelUsage(cost: number, usage: Usage, model: string, provider?: string): ModelUsage;

function addToTotalModelUsage(cost: number, usage: ProviderUsage, model: string, provider?: string): ModelUsage;

function addToTotalModelUsage(
  cost: number,
  usage: Usage | ProviderUsage,
  model: string,
  provider?: string,
): ModelUsage {
  const modelUsage = getUsageForModel(model) ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    costUSD: 0,
    contextWindow: 0,
    maxOutputTokens: 0,
    provider: undefined,
  };
  // Record the provider that was used for this model. If multiple providers
  // serve the same model name, the first one wins (most common case).
  // Falls back to the currently active provider if not explicitly passed.
  if (!modelUsage.provider) {
    modelUsage.provider = provider || ProviderManager.getInstance().getActiveProviderName();
  }

  // Normalize usage data — handle both Anthropic Usage (snake_case) and ProviderUsage (camelCase)
  const isAnthropicUsage = 'input_tokens' in usage;
  const inputTokens = isAnthropicUsage ? (usage as Usage).input_tokens : (usage as ProviderUsage).inputTokens;
  const outputTokens = isAnthropicUsage ? (usage as Usage).output_tokens : (usage as ProviderUsage).outputTokens;
  const cacheReadTokens = isAnthropicUsage
    ? ((usage as Usage).cache_read_input_tokens ?? 0)
    : ((usage as ProviderUsage).cacheReadInputTokens ?? 0);
  const cacheCreateTokens = isAnthropicUsage
    ? ((usage as Usage).cache_creation_input_tokens ?? 0)
    : ((usage as ProviderUsage).cacheCreationInputTokens ?? 0);
  const webSearchRequests = isAnthropicUsage
    ? ((usage as Usage).server_tool_use?.web_search_requests ?? 0)
    : ((usage as ProviderUsage).webSearchRequests ?? 0);

  modelUsage.inputTokens += inputTokens;
  modelUsage.outputTokens += outputTokens;
  modelUsage.cacheReadInputTokens += cacheReadTokens;
  modelUsage.cacheCreationInputTokens += cacheCreateTokens;
  modelUsage.webSearchRequests += webSearchRequests;
  modelUsage.costUSD += cost;
  modelUsage.contextWindow = getContextWindowForModel(model, getSdkBetas());
  modelUsage.maxOutputTokens = getModelMaxOutputTokens(model).default;
  return modelUsage;
}

/**
 * @[MULTI_PROVIDER] Track session cost from Anthropic Usage object.
 * For non-Anthropic providers, use the ProviderUsage overload.
 */
export function addToTotalSessionCost(cost: number, usage: Usage, model: string, provider?: string): number;

export function addToTotalSessionCost(cost: number, usage: ProviderUsage, model: string, provider?: string): number;

export function addToTotalSessionCost(
  cost: number,
  usage: Usage | ProviderUsage,
  model: string,
  provider?: string,
): number {
  const modelUsage = addToTotalModelUsage(cost, usage, model, provider);
  addToTotalCostState(cost, modelUsage, model);

  const isAnthropicUsage = 'input_tokens' in usage;
  const inputTokens = isAnthropicUsage ? (usage as Usage).input_tokens : (usage as ProviderUsage).inputTokens;
  const outputTokens = isAnthropicUsage ? (usage as Usage).output_tokens : (usage as ProviderUsage).outputTokens;
  const cacheReadTokens = isAnthropicUsage
    ? ((usage as Usage).cache_read_input_tokens ?? 0)
    : ((usage as ProviderUsage).cacheReadInputTokens ?? 0);
  const cacheCreateTokens = isAnthropicUsage
    ? ((usage as Usage).cache_creation_input_tokens ?? 0)
    : ((usage as ProviderUsage).cacheCreationInputTokens ?? 0);
  const speed = isAnthropicUsage ? (usage as Usage).speed : undefined;

  const attrs = isFastModeEnabled() && speed === 'fast' ? { model, speed: 'fast' } : { model };

  getCostCounter()?.add(cost, attrs);
  getTokenCounter()?.add(inputTokens, { ...attrs, type: 'input' });
  getTokenCounter()?.add(outputTokens, { ...attrs, type: 'output' });
  getTokenCounter()?.add(cacheReadTokens, { ...attrs, type: 'cacheRead' });
  getTokenCounter()?.add(cacheCreateTokens, { ...attrs, type: 'cacheCreation' });

  // Advisor usage is always in Anthropic Usage format — only track when called with Usage
  let totalCost = cost;
  if (isAnthropicUsage) {
    for (const advisorUsage of getAdvisorUsage(usage as Usage)) {
      const advisorCost = calculateUSDCost(advisorUsage.model, advisorUsage);
      logEvent('tengu_advisor_tool_token_usage', {
        advisor_model: advisorUsage.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        input_tokens: advisorUsage.input_tokens,
        output_tokens: advisorUsage.output_tokens,
        cache_read_input_tokens: advisorUsage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: advisorUsage.cache_creation_input_tokens ?? 0,
        cost_usd_micros: Math.round(advisorCost * 1_000_000),
      });
      totalCost += addToTotalSessionCost(advisorCost, advisorUsage, advisorUsage.model);
    }
  }
  return totalCost;
}
