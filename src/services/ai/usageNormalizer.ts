import type { ProviderId } from './providers/ProviderInterface.js';

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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
  const inputTokens =
    normalizeTokenCount(maybeObj.input_tokens) ??
    normalizeTokenCount(maybeObj.prompt_tokens) ??
    normalizeTokenCount(maybeObj.promptTokens) ??
    0;
  const outputTokens =
    normalizeTokenCount(maybeObj.output_tokens) ??
    normalizeTokenCount(maybeObj.completion_tokens) ??
    normalizeTokenCount(maybeObj.completionTokens) ??
    0;
  const totalTokens =
    normalizeTokenCount(maybeObj.total_tokens) ??
    normalizeTokenCount(maybeObj.totalTokens) ??
    inputTokens + outputTokens;
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
    costUSD,
    billingModel: typeof maybeObj.model === 'string' ? maybeObj.model : provider,
  };
}
