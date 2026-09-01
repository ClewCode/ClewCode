import { getSessionId } from '../../bootstrap/state.js';
import { formatTotalCost, getModelUsage } from '../../cost-tracker.js';
import { getRootedLedger } from '../../services/accounting/ledger.js';
import { calculateCacheMetrics } from '../../services/ai/cacheMetrics.js';
import { getPromptCachingSupport } from '../../services/ai/providerCapabilities.js';
import { currentLimits } from '../../services/claudeAiLimits.js';
import type { LocalCommandCall } from '../../types/command.js';
import { isClaudeAISubscriber } from '../../utils/auth.js';
import { getCanonicalName } from '../../utils/model/model.js';
import { getModelCosts } from '../../utils/modelCost.js';

function formatCost(cost: number): string {
  return `$${cost > 0.5 ? cost.toFixed(2) : cost.toFixed(4)}`;
}

function formatPercentage(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatCacheBreakdown(model: string, usage: ReturnType<typeof getModelUsage>[string]): string {
  const support = getPromptCachingSupport(usage.provider);
  const metrics = calculateCacheMetrics({
    support,
    inputTokens: usage.inputTokens,
    cacheReadInputTokens: usage.cacheReadInputTokens,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
    requestCount: usage.cacheRequestCount ?? 0,
    reportedRequestCount: usage.cacheReportedRequestCount ?? 0,
    hitRequestCount: usage.cacheHitRequestCount ?? 0,
    rates: getModelCosts(model),
  });
  const lines = [
    `  cache status: ${metrics.status} (${support})`,
    `  cache read: ${usage.cacheReadInputTokens.toLocaleString()}`,
    `  cache write: ${usage.cacheCreationInputTokens.toLocaleString()}`,
  ];
  if (metrics.hitRate !== null) lines.push(`  token hit rate: ${formatPercentage(metrics.hitRate)}`);
  if (metrics.requestHitRate !== null) lines.push(`  request hit rate: ${formatPercentage(metrics.requestHitRate)}`);
  if (metrics.reportingCoverage !== null) {
    lines.push(`  reporting coverage: ${formatPercentage(metrics.reportingCoverage)}`);
  }
  if (metrics.estimatedSavingsUSD !== null && metrics.estimatedSavingsUSD > 0) {
    lines.push(`  estimated cache savings: ${formatCost(metrics.estimatedSavingsUSD)}`);
  }
  return lines.join('\n');
}

function formatPerModelUsage(): string {
  const entries = Object.entries(getModelUsage());
  if (entries.length === 0) return '';
  let value = '\n\nPer-model usage and cache observability:';
  for (const [model, usage] of entries) {
    value +=
      `\n\n${getCanonicalName(model)}${usage.provider ? ` (${usage.provider})` : ''}:` +
      `\n  input: ${usage.inputTokens.toLocaleString()}` +
      `\n  output: ${usage.outputTokens.toLocaleString()}` +
      `\n${formatCacheBreakdown(model, usage)}` +
      `\n  cost: ${formatCost(usage.costUSD)}`;
  }
  return value;
}

export const call: LocalCommandCall = async args => {
  const argText = args?.trim().toLowerCase() || '';

  // Show hierarchical agent tree cost breakdown
  if (argText === 'tree') {
    const rootSessionId = getSessionId();
    const ledger = getRootedLedger();
    const treeSummary = ledger.getTreeSummary(rootSessionId);

    if (!treeSummary) {
      return {
        type: 'text',
        value: `No subagent accounting recorded for session ${rootSessionId}.\nTotal session cost: ${formatTotalCost()}`,
      };
    }

    return {
      type: 'text',
      value: `Rooted Agent Resource Tree Breakdown:\n\n${ledger.formatTreeReport(treeSummary)}\n\nTotal session cost: ${formatTotalCost()}`,
    };
  }

  if (isClaudeAISubscriber()) {
    let value: string;

    if (currentLimits.isUsingOverage) {
      value =
        'You are currently using your overages to power your Clew Code usage. We will automatically switch you back to your subscription rate limits when they reset';
    } else {
      value = 'You are currently using your subscription to power your Clew Code usage';
    }

    if (process.env.USER_TYPE === 'ant') {
      value += `\n\n[ANT-ONLY] Showing cost anyway:\n ${formatTotalCost()}`;
    } else {
      value += formatPerModelUsage();
    }
    return { type: 'text', value };
  }
  return { type: 'text', value: `Total session cost: ${formatTotalCost()}${formatPerModelUsage()}` };
};
