import type { EffortLevel } from '../effort.js';
import { getSettings_DEPRECATED, updateSettingsForSource } from '../settings/settings.js';

export type FallbackEntry = {
  provider?: string; // omitted = active provider at trigger time
  model: string;
  effort?: EffortLevel;
};

/**
 * Get the current model fallback chain from settings.
 * @returns The configured fallback chain, empty array if unset
 */
export function getModelFallbackChain(): FallbackEntry[] {
  const settings = getSettings_DEPRECATED() || {};
  return settings.modelFallbacks ?? [];
}

/**
 * Add an entry to the end of the fallback chain.
 * @param entry The fallback entry to append
 */
export function addFallbackEntry(entry: FallbackEntry): void {
  const chain = getModelFallbackChain();
  chain.push(entry);
  updateSettingsForSource('userSettings', { modelFallbacks: chain });
}

/**
 * Remove an entry from the fallback chain by index.
 * @param index The 0-based index of the entry to remove
 */
export function removeFallbackEntry(index: number): void {
  const chain = getModelFallbackChain();
  if (index >= 0 && index < chain.length) {
    chain.splice(index, 1);
    updateSettingsForSource('userSettings', { modelFallbacks: chain });
  }
}

/**
 * Move an entry in the fallback chain from one index to another.
 * @param fromIndex Source index
 * @param toIndex Destination index
 */
export function moveFallbackEntry(fromIndex: number, toIndex: number): void {
  const chain = getModelFallbackChain();
  if (fromIndex >= 0 && fromIndex < chain.length && toIndex >= 0 && toIndex < chain.length) {
    const [entry] = chain.splice(fromIndex, 1);
    chain.splice(toIndex, 0, entry);
    updateSettingsForSource('userSettings', { modelFallbacks: chain });
  }
}

/**
 * Clear the entire fallback chain.
 */
export function clearFallbackChain(): void {
  updateSettingsForSource('userSettings', { modelFallbacks: [] });
}

/**
 * Resolve the next fallback entry to use, filtering by provider.
 * Same-provider entries (provider unset or matches activeProvider) are tried first.
 * Cross-provider entries are skipped for mid-retry use and flagged as `isSameProvider: false`.
 *
 * @param chain The fallback chain
 * @param index Current position in the chain
 * @param activeProvider The active provider at the time of the fallback trigger
 * @returns The next entry and whether it's same-provider, or undefined if exhausted
 */
export function resolveNextFallback(
  chain: FallbackEntry[],
  index: number,
  activeProvider: string,
): { entry: FallbackEntry; index: number; isSameProvider: boolean } | undefined {
  // Scan forward for the next usable entry. `index` is where to resume, not
  // necessarily where we land — cross-provider entries in between are skipped,
  // so the caller must advance its cursor to the returned `index` (not by one)
  // or a skipped entry would be re-selected on every subsequent trigger.
  for (let i = index; i < chain.length; i++) {
    const entry = chain[i]!;
    const entryProvider = entry.provider ?? activeProvider;
    if (entryProvider === activeProvider) {
      return { entry, index: i, isSameProvider: true };
    }
  }

  // No same-provider entry left. Cross-provider entries are deliberately not
  // used mid-retry — switching providers requires mutating a process-global
  // that leaks into concurrent subagents. They apply from the next query.
  return undefined;
}
