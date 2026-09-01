import type { ProviderId } from './providers/ProviderInterface.js';
import { fromGenericUsage } from './usageTypes.js';

interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  costUSD?: number;
  billingModel?: string;
}

function normalizeTokenCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

export function normalizeUsage(raw: unknown, provider?: ProviderId): NormalizedUsage {
  if (!raw || typeof raw !== 'object') {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  const usage = (raw as Record<string, unknown>).usage ?? raw;
  const maybeObj = typeof usage === 'object' ? (usage as Record<string, unknown>) : {};
  const normalized = fromGenericUsage(maybeObj);
  const { inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens } = normalized;
  const totalTokens =
    normalizeTokenCount(maybeObj.total_tokens) ??
    normalizeTokenCount(maybeObj.totalTokens) ??
    inputTokens + outputTokens + (cacheReadInputTokens ?? 0) + (cacheCreationInputTokens ?? 0);
  const costUSD =
    typeof maybeObj.cost === 'number'
      ? maybeObj.cost
      : typeof maybeObj.cost === 'string' && !Number.isNaN(Number(maybeObj.cost))
        ? Number(maybeObj.cost)
        : undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cacheReadInputTokens !== undefined ? { cacheReadInputTokens } : {}),
    ...(cacheCreationInputTokens !== undefined ? { cacheCreationInputTokens } : {}),
    costUSD,
    billingModel: typeof maybeObj.model === 'string' ? maybeObj.model : provider,
  };
}
