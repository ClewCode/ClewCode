import { formatTotalCost, getModelUsage } from '../../cost-tracker.js';
import { currentLimits } from '../../services/claudeAiLimits.js';
import type { LocalCommandCall } from '../../types/command.js';
import { isClaudeAISubscriber } from '../../utils/auth.js';
import { getCanonicalName } from '../../utils/model/model.js';

function formatCost(cost: number): string {
  return `$${cost > 0.5 ? cost.toFixed(2) : cost.toFixed(4)}`;
}

export const call: LocalCommandCall = async () => {
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
      const modelUsage = getModelUsage();
      const entries = Object.entries(modelUsage);
      if (entries.length > 0) {
        value += '\n\nPer-model and cache-hit breakdown:';
        for (const [model, usage] of entries) {
          const attemptedInput = usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
          const cacheHitRate =
            attemptedInput > 0 ? ((usage.cacheReadInputTokens / attemptedInput) * 100).toFixed(1) : '0.0';
          value +=
            `\n\n${getCanonicalName(model)}:` +
            `\n  input: ${usage.inputTokens.toLocaleString()}` +
            `\n  output: ${usage.outputTokens.toLocaleString()}` +
            `\n  cache read: ${usage.cacheReadInputTokens.toLocaleString()}` +
            `\n  cache write: ${usage.cacheCreationInputTokens.toLocaleString()}` +
            `\n  cache hit rate: ${cacheHitRate}%` +
            `\n  cost: ${formatCost(usage.costUSD)}`;
        }
      }
    }
    return { type: 'text', value };
  }
  return { type: 'text', value: formatTotalCost() };
};
