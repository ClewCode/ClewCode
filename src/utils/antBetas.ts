import { getInitialSettings, updateSettingsForSource } from './settings/settings.js';

export type AntBetaKey = 'cliInternal' | 'connectorText' | 'tokenEfficientTools' | 'numericEffort';

export const ANT_BETA_LABELS: Record<AntBetaKey, string> = {
  cliInternal: 'cli-internal-2026-02-09 (ant internal features)',
  connectorText: 'summarize-connector-text-2026-03-13 (anti-distillation)',
  tokenEfficientTools: 'token-efficient-tools-2026-03-28 (~4.5% token saving)',
  numericEffort: 'numeric effort override',
};

const ALL_KEYS: AntBetaKey[] = ['cliInternal', 'connectorText', 'tokenEfficientTools', 'numericEffort'];

export function getAntBetaSettings(): Record<AntBetaKey, boolean> {
  const settings = getInitialSettings();
  const antBetas = settings.antBetas ?? {};
  return {
    cliInternal: antBetas.cliInternal ?? false,
    connectorText: antBetas.connectorText ?? false,
    tokenEfficientTools: antBetas.tokenEfficientTools ?? false,
    numericEffort: antBetas.numericEffort ?? false,
  };
}

export function setAntBetaSetting(key: string, value: boolean): { error: Error | null } {
  if (!ALL_KEYS.includes(key as AntBetaKey)) {
    return { error: new Error(`Unknown ant beta setting: ${key}. Valid keys: ${ALL_KEYS.join(', ')}`) };
  }
  // Pass only the single key-value pair; updateSettingsForSource deep-merges
  // with existing antBetas in the user settings file.
  return updateSettingsForSource('userSettings', {
    antBetas: { [key]: value || undefined },
  });
}

export function setAllAntBetas(value: boolean): { error: Error | null } {
  const update: Record<string, boolean | undefined> = {};
  for (const key of ALL_KEYS) {
    update[key] = value || undefined;
  }
  return updateSettingsForSource('userSettings', { antBetas: update });
}

export function getAntBetaStatus(): Array<{ key: AntBetaKey; enabled: boolean; label: string }> {
  const settings = getAntBetaSettings();
  return ALL_KEYS.map(key => ({
    key,
    enabled: settings[key],
    label: ANT_BETA_LABELS[key],
  }));
}
