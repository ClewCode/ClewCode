import type { LocalCommandCall } from '../../types/command.js'

export const call: LocalCommandCall = async (args, context) => {
  const { getAppState, setAppState } = context;
  const currentMode = getAppState().settings.explorerMode ?? 'none';
  
  let nextMode: 'none' | 'sidebar' | 'fullscreen';
  if (args === 'on' || args === 'sidebar') {
    nextMode = 'sidebar';
  } else if (args === 'off' || args === 'none') {
    nextMode = 'none';
  } else if (args === 'fullscreen') {
    nextMode = 'fullscreen';
  } else {
    // Toggle
    nextMode = currentMode === 'none' ? 'sidebar' : 'none';
  }
  
  setAppState(prev => ({
    ...prev,
    settings: {
      ...prev.settings,
      explorerMode: nextMode
    }
  }));
  
  const { updateSettingsForSource } = await import('../../utils/settings/settings.js');
  updateSettingsForSource('userSettings', { explorerMode: nextMode });

  // Also persist to global config for good measure
  const { saveGlobalConfig } = await import('../../utils/config.js');
  saveGlobalConfig(prev => ({
    ...prev,
    explorerMode: nextMode
  }));

  return { type: 'text', value: `File explorer set to: ${nextMode}` };
}
