import { ProviderManager } from '../../services/ai/ProviderManager.js';
import { getProviderModelInfo } from '../../services/ai/providerCapabilities.js';
import {
  getProviderRegistryEntry,
  getSerializableProviderRegistryEntry,
  normalizeProviderId,
  PROVIDER_IDS,
} from '../../services/ai/providerRegistry.js';
import type { ProviderId } from '../../services/ai/providers/ProviderInterface.js';

/** A `/model` argument split into an optional provider switch and the model id. */
export type ModelSelection = { targetProvider?: string; model: string };

/**
 * Split a model selection into an optional provider switch and the model id.
 *
 * The provider-switch syntax is `<provider>/<model>` (e.g. `openai/gpt-5.5`),
 * which is also what the model picker hands back for every row. But several
 * providers — notably Cline — expose OpenRouter-style model ids that ALSO
 * contain a slash whose first segment collides with a real provider id
 * (`deepseek/deepseek-v4-flash`, `minimax/minimax-m3`). Blindly splitting those
 * strips the vendor prefix and sends a bare, invalid model id — the gateway then
 * rejects it with "invalid model format. Expected format: modelType/model".
 *
 * Disambiguation: if the CURRENT provider already exposes the full input as a
 * model id, keep it whole. Only otherwise, when the first segment is a known
 * provider id, treat it as a provider switch.
 */
export function resolveModelSelection(modelInput: string): ModelSelection {
  let currentProvider: string | undefined;
  try {
    currentProvider = ProviderManager.getInstance().getSelectedProviderConfig(true).provider;
  } catch {
    // ProviderManager may not be initialized in every context — fall through
    // to the prefix-splitting heuristic below.
  }

  // Current provider already owns this exact id (vendor-prefixed model like
  // Cline's `deepseek/deepseek-v4-flash`) → keep it whole, do NOT strip.
  if (currentProvider && getProviderModelInfo(currentProvider as ProviderId, modelInput)) {
    return { model: modelInput };
  }

  const parts = modelInput.split('/');
  const firstSegment = parts[0];
  if (firstSegment && PROVIDER_IDS.includes(firstSegment as ProviderId)) {
    return { targetProvider: firstSegment, model: parts.slice(1).join('/') };
  }
  return { model: modelInput };
}

/** AppState fields the caller must merge in so the UI and query pipeline agree. */
export type ProviderSwitchPatch = {
  mainLoopProvider?: string;
  mainLoopProviderForSession?: string | undefined;
};

/**
 * Route requests to the provider that owns the model the user just picked.
 *
 * Picking `openai/gpt-5.5` out of the OpenAI group has to switch the provider
 * too — otherwise the bare model id is sent to whichever provider happened to
 * be active and the request 400s (or silently resolves to a different model).
 *
 * Session-scoped switches go through ProviderManager's session overlay (in
 * memory, this process only) so the shared provider.json and other terminals
 * are untouched — the same mechanism `/providers` uses. Only `persistAsDefault`
 * writes to disk.
 *
 * Returns the AppState patch the caller must apply (onChangeAppState syncs
 * `mainLoopProviderForSession` into ProviderManager's session provider, which
 * is what `getActiveProviderName()` reads first), or null when there is no
 * provider to switch to.
 */
/**
 * Layer the user's saved provider config over the registry defaults.
 *
 * The saved config wins, but only for keys that actually carry a value: the
 * registry ships empty strings for providers with no default endpoint (e.g.
 * `custom`), and a previously-saved blank `baseUrl`/`apiKey` must not erase a
 * registry entry that does have one. Spreading the saved config wholesale
 * would do exactly that.
 */
export function mergeProviderConfig(
  registryEntry: Record<string, unknown>,
  savedConfig: Record<string, unknown>,
): Record<string, unknown> {
  const savedOverrides = Object.fromEntries(
    Object.entries(savedConfig).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
  return { ...registryEntry, ...savedOverrides };
}

export function applyProviderSwitch({
  targetProvider,
  model,
  persistAsDefault,
}: {
  targetProvider: string | undefined;
  model: string | null;
  persistAsDefault: boolean;
}): ProviderSwitchPatch | null {
  const providerId = normalizeProviderId(targetProvider);
  if (!providerId) return null;

  const providerManager = ProviderManager.getInstance();
  const onDisk = providerManager.getOnDiskProviderConfig(true);
  const registryEntry = getSerializableProviderRegistryEntry(providerId) as unknown as Record<string, unknown>;
  const onDiskConfig =
    onDisk.provider === providerId && onDisk.providerConfig ? (onDisk.providerConfig as Record<string, unknown>) : {};
  const mergedProviderConfig = mergeProviderConfig(registryEntry, onDiskConfig);

  if (persistAsDefault) {
    try {
      // saveSelectedProviderConfig reverts provider/model whenever a session
      // override is live, so drop the overlay BEFORE writing — otherwise
      // "set as default" after a session switch silently writes the old
      // provider back.
      providerManager.setSessionProvider(null);
      providerManager.setSessionModel(null);
      providerManager.setSessionProviderConfig(null);

      providerManager.saveSelectedProviderConfig({
        ...onDisk,
        provider: providerId,
        model: model ?? onDisk.model,
        providerConfig: mergedProviderConfig,
      });
    } catch {
      // Non-critical: provider.json write is best-effort.
    }
    return { mainLoopProvider: providerId, mainLoopProviderForSession: undefined };
  }

  providerManager.setSessionProviderConfig({
    provider: providerId,
    ...(model ? { model } : {}),
    providerConfig: mergedProviderConfig,
  });

  return { mainLoopProviderForSession: providerId };
}

/** Human-readable provider label for status messages (`openai` → `OpenAI`). */
export function providerDisplayName(providerId: string | undefined): string {
  const canonical = normalizeProviderId(providerId);
  if (!canonical) return providerId ?? '';
  return getProviderRegistryEntry(canonical).label ?? canonical;
}
