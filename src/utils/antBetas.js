import { getInitialSettings, updateSettingsForSource } from './settings/settings.js';
export const ANT_BETA_LABELS = {
  cliInternal: 'cli-internal-2026-02-09 (ant internal features)',
  connectorText: 'summarize-connector-text-2026-03-13 (anti-distillation)',
  tokenEfficientTools: 'token-efficient-tools-2026-03-28 (~4.5% token saving)',
  numericEffort: 'numeric effort override',
};
const ALL_KEYS = ['cliInternal', 'connectorText', 'tokenEfficientTools', 'numericEffort'];
export function getAntBetaSettings() {
  const settings = getInitialSettings();
  const antBetas = settings.antBetas ?? {};
  return {
    cliInternal: antBetas.cliInternal ?? false,
    connectorText: antBetas.connectorText ?? false,
    tokenEfficientTools: antBetas.tokenEfficientTools ?? false,
    numericEffort: antBetas.numericEffort ?? false,
  };
}
export function setAntBetaSetting(key, value) {
  if (!ALL_KEYS.includes(key)) {
    return { error: new Error(`Unknown ant beta setting: ${key}. Valid keys: ${ALL_KEYS.join(', ')}`) };
  }
  // Pass only the single key-value pair; updateSettingsForSource deep-merges
  // with existing antBetas in the user settings file.
  return updateSettingsForSource('userSettings', {
    antBetas: { [key]: value || undefined },
  });
}
export function setAllAntBetas(value) {
  const update = {};
  for (const key of ALL_KEYS) {
    update[key] = value || undefined;
  }
  return updateSettingsForSource('userSettings', { antBetas: update });
}
export function getAntBetaStatus() {
  const settings = getAntBetaSettings();
  return ALL_KEYS.map(key => ({
    key,
    enabled: settings[key],
    label: ANT_BETA_LABELS[key],
  }));
}
