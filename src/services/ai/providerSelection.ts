/**
 * Selection-time validation for provider/model choices.
 *
 * Used by the `clew provider` CLI and the `/providers` slash command to check
 * that a provider ID resolves to a PROVIDER_REGISTRY entry (applying legacy
 * aliases like gemini -> google) and that a model is known — either listed in
 * providers.json or returned by the provider's live models endpoint.
 *
 * This is distinct from utils/model/validateModel.ts, which validates the
 * active model at request time.
 */

import { fetchProviderModels } from './providerModels.js';
import { getProviderRegistryEntry, normalizeProviderId, PROVIDER_IDS } from './providerRegistry.js';
import type { ProviderId } from './providers/ProviderInterface.js';

export type ProviderModelValidation =
  | { valid: true; provider: ProviderId; model?: string }
  | { valid: false; error: string; suggestions?: string[] };

export function validateProviderSelection(providerInput: string | null | undefined): ProviderModelValidation {
  const provider = normalizeProviderId(providerInput);
  if (!provider) {
    return {
      valid: false,
      error: `Unknown provider: ${providerInput ?? '(missing)'}`,
      suggestions: PROVIDER_IDS,
    };
  }
  return { valid: true, provider };
}

/**
 * Validate a provider/model pair.
 *
 * The model is checked against the union of the static registry catalog and
 * the provider's dynamic model list. When neither source yields any models
 * (no API key, offline, custom endpoint), the model is accepted as-is — we
 * can't verify what we can't see, and rejecting would break air-gapped and
 * bring-your-own-endpoint setups.
 */
export async function validateProviderModelSelection(
  providerInput: string | null | undefined,
  model?: string | null,
): Promise<ProviderModelValidation> {
  const providerResult = validateProviderSelection(providerInput);
  if (!providerResult.valid) {
    return providerResult;
  }
  const provider = providerResult.provider;

  if (!model) {
    return { valid: true, provider };
  }

  // Custom endpoints serve arbitrary model IDs; nothing to validate against.
  if (provider === 'custom') {
    return { valid: true, provider, model };
  }

  const knownIds = new Map<string, string>();
  for (const entry of getProviderRegistryEntry(provider).models) {
    knownIds.set(entry.id.toLowerCase(), entry.id);
  }
  try {
    for (const entry of await fetchProviderModels(provider)) {
      knownIds.set(entry.id.toLowerCase(), entry.id);
    }
  } catch {
    // Dynamic listing failed; fall back to whatever the registry knows.
  }

  if (knownIds.size === 0) {
    return { valid: true, provider, model };
  }

  const match = knownIds.get(model.toLowerCase());
  if (match) {
    return { valid: true, provider, model: match };
  }

  const allIds = [...knownIds.values()];
  const needle = model.toLowerCase();
  const related = allIds.filter(id => id.toLowerCase().includes(needle) || needle.includes(id.toLowerCase()));
  return {
    valid: false,
    error: `Model '${model}' is not available on provider '${provider}'`,
    suggestions: (related.length > 0 ? related : allIds).slice(0, 5),
  };
}
