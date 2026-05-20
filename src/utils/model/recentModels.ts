import { getSettingsForSource, updateSettingsForSource } from '../settings/settings.js';

const MAX_RECENT_MODELS = 5;

export function getRecentModels(): string[] {
  const settings = getSettingsForSource('userSettings');
  return settings?.recentModels ?? [];
}

export function addRecentModel(model: string): void {
  if (!model) return;
  const current = getRecentModels();
  // Remove duplicate if exists, add to front
  const filtered = current.filter(m => m !== model);
  const updated = [model, ...filtered].slice(0, MAX_RECENT_MODELS);
  updateSettingsForSource('userSettings', { recentModels: updated });
}

export function mergeRecentModels(models: Array<string | null | undefined>): string[] {
  const merged: string[] = [];
  for (const model of models) {
    if (model && !merged.includes(model)) {
      merged.push(model);
    }
  }
  for (const model of getRecentModels()) {
    if (!merged.includes(model)) {
      merged.push(model);
    }
  }
  return merged.slice(0, MAX_RECENT_MODELS);
}
