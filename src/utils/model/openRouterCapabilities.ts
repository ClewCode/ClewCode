import type { FetchedModel } from './fetchProviderModels.js';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type OpenRouterCatalogModel = {
  id?: unknown;
  canonical_slug?: unknown;
  name?: unknown;
  context_length?: unknown;
  supported_parameters?: unknown;
  architecture?: { input_modalities?: unknown } | null;
  top_provider?: { context_length?: unknown; max_completion_tokens?: unknown } | null;
};

let cachedCatalog: { expiresAt: number; models: FetchedModel[] } | null = null;
let pendingCatalog: Promise<FetchedModel[]> | null = null;

function finitePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseOpenRouterCapabilityCatalog(raw: unknown): FetchedModel[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { data?: unknown }).data)) return [];
  return ((raw as { data: OpenRouterCatalogModel[] }).data ?? []).flatMap(model => {
    const id =
      typeof model.id === 'string' ? model.id : typeof model.canonical_slug === 'string' ? model.canonical_slug : '';
    if (!id) return [];
    const parameters = Array.isArray(model.supported_parameters) ? model.supported_parameters : undefined;
    const modalities = Array.isArray(model.architecture?.input_modalities)
      ? model.architecture.input_modalities
      : undefined;
    return [
      {
        id,
        label: typeof model.name === 'string' ? model.name : id,
        contextWindow:
          finitePositiveNumber(model.top_provider?.context_length) ?? finitePositiveNumber(model.context_length),
        supportsVision: modalities ? modalities.includes('image') : undefined,
        supportsTools: parameters ? parameters.includes('tools') : undefined,
        supportsReasoning: parameters
          ? parameters.includes('reasoning') || parameters.includes('include_reasoning')
          : undefined,
        maxOutput: finitePositiveNumber(model.top_provider?.max_completion_tokens),
      },
    ];
  });
}

function normalizedModelKey(id: string): string {
  const suffix = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  return suffix
    .replace(/:free$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

/** Match provider-native ids (including dotted versions) to OpenRouter slugs. */
export function findOpenRouterCapabilities(
  modelId: string,
  catalog: readonly FetchedModel[],
): FetchedModel | undefined {
  const key = normalizedModelKey(modelId);
  return catalog.find(model => normalizedModelKey(model.id) === key);
}

/** Fetch once per process window; an unavailable catalog degrades to unknown metadata. */
export async function fetchOpenRouterCapabilityCatalog(): Promise<FetchedModel[]> {
  if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) return cachedCatalog.models;
  if (pendingCatalog) return pendingCatalog;

  pendingCatalog = (async () => {
    try {
      const response = await fetch(OPENROUTER_MODELS_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return [];
      const models = parseOpenRouterCapabilityCatalog(await response.json());
      cachedCatalog = { expiresAt: Date.now() + CACHE_TTL_MS, models };
      return models;
    } catch {
      return [];
    } finally {
      pendingCatalog = null;
    }
  })();
  return pendingCatalog;
}
